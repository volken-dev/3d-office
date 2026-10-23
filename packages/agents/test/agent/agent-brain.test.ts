import { afterEach, describe, expect, test } from "bun:test"
import {
  type ContentBlock,
  type MessagesRequest,
  MessagesRequestSchema,
  type MessagesResponse,
  type StopReason,
} from "@the-delegation/shared/llm-messages"
import { AgentBrain, type BrainHost } from "../../src/agent/agent-brain"
import { LLMError } from "../../src/llm/errors"
import type { LLMCallOptions, LLMClient } from "../../src/llm/types"
import { MAX_INTENT_ATTEMPTS } from "../../src/orchestration/policy"
import type { LLMErrorEvent, OrchestrationDeps } from "../../src/orchestration/ports"
import type { AgentWorkStatus } from "../../src/project/types"
import type { AgentNode } from "../../src/team"
import { FakeProject } from "../support/fake-project"
import { TEST_TEAM } from "../support/team"

const team = TEST_TEAM
const worker = team.leadAgent.subagents?.find((agent) => !agent.humanInTheLoop)
const lead = team.leadAgent

type Reply = MessagesResponse | Promise<MessagesResponse> | LLMError | "hang"

function reply(content: ContentBlock[], stopReason: StopReason = "end_turn"): MessagesResponse {
  return {
    content,
    stopReason,
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    servedBy: { provider: "anthropic", model: "claude-sonnet-5-5", fallback: false },
  }
}

/** Scripted client: each call takes the next reply; "hang" waits until the call is aborted. */
class ScriptedLLM implements LLMClient {
  readonly requests: MessagesRequest[] = []
  constructor(private readonly replies: Reply[]) {}

  complete(request: MessagesRequest, options?: LLMCallOptions): Promise<MessagesResponse> {
    this.requests.push(structuredClone(request))
    const next = this.replies.shift() ?? reply([{ type: "text", text: "..." }])
    if (next === "hang") {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        )
      })
    }
    if (next instanceof Promise) return next
    return next instanceof LLMError ? Promise.reject(next) : Promise.resolve(next)
  }
}

function hostFor(agent: AgentNode): BrainHost & { settledTurns: number } {
  let state: AgentWorkStatus = "idle"
  let taskId: string | null = null
  return {
    settledTurns: 0,
    data: agent,
    get state() {
      return state
    },
    setState(next) {
      state = next
    },
    setTask(next) {
      taskId = next
    },
    getCurrentTaskId: () => taskId,
    onTurnSettled() {
      this.settledTurns++
    },
  }
}

const brains: AgentBrain[] = []

function setup(agent: AgentNode | undefined, scriptFor: (taskId: string) => Reply[] = () => []) {
  if (!agent) throw new Error("Fixture team is missing an agent")
  const project = new FakeProject()
  project.startProject("Build a login page")
  const task = project.addTask({
    title: "Write the form",
    description: "Email and password fields",
    assignedAgentId: agent.index,
    status: "in_progress",
    requiresUserApproval: false,
  })
  const llm = new ScriptedLLM(scriptFor(task.id))
  const errors: LLMErrorEvent[] = []
  const dependencies: OrchestrationDeps = {
    project,
    team: { getTeam: () => team },
    createLLMClient: () => llm,
    events: {
      llmError: (event) => errors.push(event),
      autonomyPaused: () => {},
      briefSet: () => {},
    },
  }
  const host = hostFor(agent)
  host.setTask(task.id)
  const brain = new AgentBrain(host, dependencies)
  brains.push(brain)
  return { project, task, llm, errors, brain, agent, host }
}

function completeTaskCall(taskId: string, id = "toolu_1"): ContentBlock {
  return { type: "tool_call", id, name: "complete_task", input: { taskId, output: "<form />" } }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

afterEach(() => {
  for (const brain of brains.splice(0)) brain.dispose()
})

describe("AgentBrain model turns", () => {
  test("answers every tool call with a tool result, so the next request is valid", async () => {
    const { project, task, llm, brain, agent } = setup(worker, (taskId) => [
      reply(
        [
          {
            type: "reasoning",
            provider: "anthropic",
            payload: { type: "thinking", signature: "s" },
          },
          completeTaskCall(taskId, "toolu_ok"),
          { type: "tool_call", id: "toolu_bad", name: "deliver_project", input: { output: "x" } },
        ],
        "tool_use",
      ),
    ])

    await brain.executeTask(task.id)

    const history = project.getHistory(agent.index)
    const results = history.at(-1)
    expect(results?.role).toBe("user")
    expect(results?.content).toEqual([
      { type: "tool_result", toolCallId: "toolu_ok", content: "Task completed.", isError: false },
      {
        type: "tool_result",
        toolCallId: "toolu_bad",
        content: 'Tool "deliver_project" is not available to you right now.',
        isError: true,
      },
    ])
    expect(project.getTask(task.id)?.status).toBe("done")

    await brain.chat("Anything else?")
    const followUp = llm.requests.at(-1)
    expect(MessagesRequestSchema.safeParse(followUp).success).toBe(true)
    expect(followUp?.messages.some((message) => message.content[0]?.type === "reasoning")).toBe(
      true,
    )
  })

  test("sends history whole and append-only: each request extends the previous one", async () => {
    const { llm, brain } = setup(worker)
    await brain.chat("First")
    await brain.chat("Second")
    const [first, second] = llm.requests
    expect(second?.messages.slice(0, first?.messages.length)).toEqual(first?.messages ?? [])
    expect(second?.system).toBe(first?.system ?? "")
  })

  test("adds a project-context turn only when the context changed", async () => {
    const { project, brain, agent } = setup(worker)
    const contextTurns = () =>
      project.getHistory(agent.index).filter((message) => message.metadata?.context).length

    await brain.chat("First")
    await brain.chat("Second")
    expect(contextTurns()).toBe(1)

    project.addTask({
      title: "Write the API",
      description: "Login endpoint",
      assignedAgentId: agent.index,
      status: "scheduled",
      requiresUserApproval: false,
    })
    await brain.chat("Third")
    expect(contextTurns()).toBe(2)
  })

  test("keeps the system prompt stable across phases", async () => {
    const { project, llm, brain } = setup(lead)
    await brain.chat("Working")
    project.update({ phase: "done" })
    await brain.chat("Done")
    expect(llm.requests[1]?.system).toBe(llm.requests[0]?.system ?? "")
  })

  test("does not run tool calls from a truncated or refused turn, but still answers them", async () => {
    for (const stopReason of ["max_tokens", "refusal"] as const) {
      const { project, task, brain, agent } = setup(worker, (taskId) => [
        reply([completeTaskCall(taskId)], stopReason),
      ])
      await brain.executeTask(task.id)
      expect(project.getTask(task.id)?.status).toBe("in_progress")
      expect(project.getHistory(agent.index).at(-1)?.content[0]).toMatchObject({
        type: "tool_result",
        toolCallId: "toolu_1",
        isError: true,
      })
    }
  })

  test("a chat failure is shown in the chat but never sent to the model", async () => {
    const { project, llm, brain, agent } = setup(worker, () => [
      new LLMError("unavailable", "Gateway unreachable"),
    ])
    await brain.chat("Hi")
    const notice = project.getHistory(agent.index).at(-1)
    expect(notice?.metadata).toEqual({ error: true, displayOnly: true })

    await brain.chat("Again")
    const texts = llm.requests
      .at(-1)
      ?.messages.flatMap((message) => message.content)
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
    expect(texts?.some((text) => text.includes("Gateway unreachable"))).toBe(false)
  })

  test("a chat message sent mid-turn queues and is recorded after that turn's reply", async () => {
    let release: (response: MessagesResponse) => void = () => {}
    const pending = new Promise<MessagesResponse>((resolve) => {
      release = resolve
    })
    const { project, task, llm, brain, agent, host } = setup(worker, () => [pending])

    const taskTurn = brain.executeTask(task.id)
    await settle()
    const chatTurn = brain.chat("Status?")
    await settle()
    expect(llm.requests).toHaveLength(1)
    expect(brain.isThinking).toBe(true)

    release(reply([{ type: "text", text: "Working" }]))
    await Promise.all([taskTurn, chatTurn])

    const texts = project
      .getHistory(agent.index)
      .flatMap((message) => message.content)
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
    expect(texts.indexOf("Status?")).toBeGreaterThan(texts.indexOf("Working"))
    expect(llm.requests).toHaveLength(2)
    expect(MessagesRequestSchema.safeParse(llm.requests[1]).success).toBe(true)
    expect(brain.isThinking).toBe(false)
    expect(host.settledTurns).toBe(2)
  })

  test("counts each request against the call budget", async () => {
    const { project, brain } = setup(worker)
    await brain.chat("One")
    await brain.chat("Two")
    expect(project.callsUsed).toBe(2)
  })

  test("asks for the agent's own model", async () => {
    const { llm, brain, agent } = setup(worker)
    await brain.chat("Go")
    expect(llm.requests[0]?.model).toBe(agent.model)
  })
})

describe("AgentBrain autonomous work", () => {
  test("a productive turn completes the task and clears its attempts", async () => {
    const { project, task, llm, brain } = setup(worker, (taskId) => [
      reply([completeTaskCall(taskId)], "tool_use"),
    ])
    project.intentAttempts.set(task.id, { count: 1, lastAttemptAt: 0, lastError: "timeout" })

    await brain.executeTask(task.id)

    expect(llm.requests).toHaveLength(1)
    expect(project.getTask(task.id)?.status).toBe("done")
    expect(project.getIntentAttempts(task.id)).toBeUndefined()
  })

  test("pauses for the budget instead of calling the model when the call budget is spent", async () => {
    const { project, task, llm, brain } = setup(worker)
    project.callsUsed = project.callLimit

    const turn = brain.executeTask(task.id)
    await settle()

    expect(llm.requests).toHaveLength(0)
    expect(project.pauses.map((pause) => pause.kind)).toEqual(["budget"])

    project.update({ runId: project.snapshot().runId + 1 })
    expect(await turn).toEqual({ status: "skipped" })
  })

  test("pauses after repeated unproductive attempts at one intent", async () => {
    const { project, task, llm, brain } = setup(worker)
    project.intentAttempts.set(task.id, {
      count: MAX_INTENT_ATTEMPTS,
      lastAttemptAt: 0,
      lastError: "timeout",
    })

    const turn = brain.executeTask(task.id)
    await settle()

    expect(llm.requests).toHaveLength(0)
    expect(project.pauses[0]).toMatchObject({ kind: "failures", taskId: task.id })

    project.update({ runId: project.snapshot().runId + 1 })
    await turn
  })

  test("rate limiting records the attempt, marks the task and pauses autonomy", async () => {
    const { project, task, errors, brain } = setup(worker, () => [
      new LLMError("rate_limited", "Rate limited"),
    ])

    const result = await brain.executeTask(task.id)

    expect(result).toMatchObject({ status: "failed", error: { kind: "rate_limited" } })
    expect(errors.map((error) => error.kind)).toEqual(["rate_limited"])
    expect(project.getIntentAttempts(task.id)?.count).toBe(1)
    expect(project.getTask(task.id)?.error).toBe("Rate limited")
    expect(project.pauses.map((pause) => pause.kind)).toEqual(["quota"])
  })

  test("a gateway configuration error pauses autonomy until it is configured", async () => {
    const { project, task, brain } = setup(worker, () => [
      new LLMError("not_configured", "No provider key"),
    ])
    await brain.executeTask(task.id)
    expect(project.pauses.map((pause) => pause.kind)).toEqual(["not_configured"])
  })

  test("a reset aborts the in-flight call and discards its result", async () => {
    const { project, task, llm, errors, brain, agent } = setup(worker, () => ["hang"])

    const turn = brain.executeTask(task.id)
    await settle()
    expect(llm.requests).toHaveLength(1)
    const historyBeforeReset = project.getHistory(agent.index).length

    project.update({ runId: project.snapshot().runId + 1 })

    expect(await turn).toEqual({ status: "skipped" })
    expect(errors).toEqual([])
    expect(project.getHistory(agent.index)).toHaveLength(historyBeforeReset)
  })
})
