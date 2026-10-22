import { afterEach, describe, expect, test } from "bun:test"
import { AgentBrain, type BrainHost } from "../../../src/core/agent/AgentBrain"
import { LLMError } from "../../../src/core/llm/errors"
import type { LLMCallOptions, LLMClient, LLMResponse } from "../../../src/core/llm/types"
import { MAX_INTENT_ATTEMPTS } from "../../../src/core/orchestration/policy"
import type { LLMErrorEvent, OrchestrationDeps } from "../../../src/core/orchestration/ports"
import { AGENTIC_SETS, type AgentNode } from "../../../src/data/agents"
import type { AgentWorkStatus } from "../../../src/types"
import { FakeProject } from "../../support/fakeProject"

const team = AGENTIC_SETS[0]
const worker = team.leadAgent.subagents?.find((agent) => !agent.humanInTheLoop)

type Reply = LLMResponse | LLMError | "hang"

/** Scripted LLM client: each call takes the next reply; "hang" waits until the call is aborted. */
class ScriptedLLM implements LLMClient {
  calls = 0
  constructor(private readonly replies: Reply[]) {}

  generateCompletion(
    _messages: unknown,
    _tools: unknown,
    _system: unknown,
    _model: unknown,
    options?: LLMCallOptions,
  ): Promise<LLMResponse> {
    this.calls++
    const reply = this.replies.shift() ?? { content: "..." }
    if (reply === "hang") {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        )
      })
    }
    return reply instanceof LLMError ? Promise.reject(reply) : Promise.resolve(reply)
  }
}

function hostFor(agent: AgentNode): BrainHost & { statuses: AgentWorkStatus[] } {
  let state: AgentWorkStatus = "idle"
  let taskId: string | null = null
  const statuses: AgentWorkStatus[] = []
  return {
    data: agent,
    get state() {
      return state
    },
    setState(next) {
      state = next
      statuses.push(next)
    },
    setTask(next) {
      taskId = next
    },
    getCurrentTaskId: () => taskId,
    simulation: { processScheduledTasks: () => {} },
    statuses,
  }
}

const brains: AgentBrain[] = []

function setup(scriptFor: (taskId: string) => Reply[] = () => []) {
  if (!worker) throw new Error("Fixture team needs an agent without review")
  const project = new FakeProject()
  project.startProject("Build a login page")
  const task = project.addTask({
    title: "Write the form",
    description: "Email and password fields",
    assignedAgentId: worker.index,
    status: "in_progress",
    requiresUserApproval: false,
  })
  const llm = new ScriptedLLM(scriptFor(task.id))
  const errors: LLMErrorEvent[] = []
  const dependencies: OrchestrationDeps = {
    project,
    team: { getTeam: () => team },
    settings: { getLlmConfig: () => ({ apiKey: "test-key", model: "test-model" }) },
    createLLMClient: () => llm,
    events: {
      llmError: (event) => errors.push(event),
      autonomyPaused: () => {},
      briefSet: () => {},
    },
  }
  const host = hostFor(worker)
  host.setTask(task.id)
  const brain = new AgentBrain(host, dependencies)
  brains.push(brain)
  return { project, task, llm, errors, brain }
}

function completeTaskReply(taskId: string): LLMResponse {
  return {
    content: null,
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "complete_task",
          arguments: JSON.stringify({ taskId, output: "<form />" }),
        },
      },
    ],
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

afterEach(() => {
  for (const brain of brains.splice(0)) brain.dispose()
})

describe("AgentBrain autonomous work", () => {
  test("a productive turn completes the task and clears its attempts", async () => {
    const { project, task, llm, brain } = setup((taskId) => [completeTaskReply(taskId)])
    project.intentAttempts.set(task.id, { count: 1, lastAttemptAt: 0, lastError: "timeout" })

    await brain.executeTask(task.id)

    expect(llm.calls).toBe(1)
    expect(project.getTask(task.id)?.status).toBe("done")
    expect(project.getIntentAttempts(task.id)).toBeUndefined()
  })

  test("pauses for the budget instead of calling the model when the call budget is spent", async () => {
    const { project, task, llm, brain } = setup()
    project.callsUsed = project.callLimit

    const turn = brain.executeTask(task.id)
    await settle()

    expect(llm.calls).toBe(0)
    expect(project.pauses.map((pause) => pause.kind)).toEqual(["budget"])

    project.update({ runId: project.snapshot().runId + 1 })
    expect(await turn).toEqual({ text: "", toolCalls: [] })
  })

  test("pauses after repeated unproductive attempts at one intent", async () => {
    const { project, task, llm, brain } = setup()
    project.intentAttempts.set(task.id, {
      count: MAX_INTENT_ATTEMPTS,
      lastAttemptAt: 0,
      lastError: "timeout",
    })

    const turn = brain.executeTask(task.id)
    await settle()

    expect(llm.calls).toBe(0)
    expect(project.pauses[0]).toMatchObject({ kind: "failures", taskId: task.id })

    project.update({ runId: project.snapshot().runId + 1 })
    await turn
  })

  test("a quota error records the attempt, marks the task and pauses autonomy", async () => {
    const { project, task, errors, brain } = setup(() => [new LLMError("quota", "Rate limited")])

    const result = await brain.executeTask(task.id)

    expect(result.error?.kind).toBe("quota")
    expect(errors.map((error) => error.kind)).toEqual(["quota"])
    expect(project.getIntentAttempts(task.id)?.count).toBe(1)
    expect(project.getTask(task.id)?.error).toBe("Rate limited")
    expect(project.pauses.map((pause) => pause.kind)).toEqual(["quota"])
  })

  test("a reset aborts the in-flight call and discards its result", async () => {
    const { project, task, llm, errors, brain } = setup(() => ["hang"])

    const turn = brain.executeTask(task.id)
    await settle()
    expect(llm.calls).toBe(1)
    const historyBeforeReset = project.getHistory(task.assignedAgentId).length

    project.update({ runId: project.snapshot().runId + 1 })

    expect(await turn).toEqual({ text: "", toolCalls: [] })
    expect(errors).toEqual([])
    expect(project.getHistory(task.assignedAgentId)).toHaveLength(historyBeforeReset)
  })
})
