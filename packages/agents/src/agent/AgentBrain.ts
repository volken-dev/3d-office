import type {
  MessagesRequest,
  StopReason,
  ToolCallBlock,
  ToolDefinition,
  ToolResultBlock,
} from "@the-delegation/shared/llm-messages"
import { type LLMError, toLLMError } from "../llm/errors"
import type { AgentMessage } from "../llm/types"
import {
  backoffDelayMs,
  LLM_CALL_BUDGET,
  LLM_TIMEOUT_MS,
  MAX_INTENT_ATTEMPTS,
} from "../orchestration/policy"
import type { OrchestrationDeps, ProjectSnapshot } from "../orchestration/ports"
import type { AgentWorkStatus } from "../project/types"
import type { AgentNode } from "../team"
import { lastContextText, toRequestMessages } from "./history"
import { buildContextText, buildSystemPrompt } from "./PromptBuilder"
import { getToolDefinitions, type ParsedToolCall, parseToolCall, runToolCall } from "./ToolRegistry"
import type { ToolContext } from "./tools/types"

/** What the brain needs from the agent runtime that owns it (AgentHost). */
export interface BrainHost {
  data: AgentNode
  readonly state: AgentWorkStatus
  setState(state: AgentWorkStatus): void
  setTask(taskId: string | null): void
  getCurrentTaskId(): string | null
  simulation: { processScheduledTasks(): void }
}

export interface ThinkOptions {
  /** A reply to a user chat message that is already in the history. */
  isChat?: boolean
  /** Autonomous prompt: kept in the model context but hidden from the chat. */
  silent?: boolean
}

export interface ThinkResult {
  text: string
  toolCalls: ParsedToolCall[]
  /** The model declined; the turn made no progress. */
  refused?: boolean
  error?: LLMError
}

const SKIPPED: ThinkResult = Object.freeze({ text: "", toolCalls: [] })

const SPARK_KEY = "spark"
const CONCLUDE_KEY = "conclude"

/**
 * One agent's model turns. Owns the single retry/backoff/budget policy for autonomous work and
 * cancels in-flight calls when the run resets or the agent's task disappears.
 */
export class AgentBrain {
  private inflight: Promise<ThinkResult> | null = null
  private controller: AbortController | null = null
  /** An autonomous intent is waiting for backoff, budget or a resume before calling the model. */
  private waiting = false
  private disposed = false
  private readonly waiters = new Set<() => void>()
  private readonly unsubscribe: () => void

  constructor(
    private readonly host: BrainHost,
    private readonly dependencies: OrchestrationDeps,
  ) {
    this.unsubscribe = dependencies.project.subscribe((next, previous) =>
      this.onProjectChange(next, previous),
    )
  }

  public get isThinking(): boolean {
    return this.inflight !== null || this.waiting
  }

  /**
   * Runs one model turn. Chat turns queue behind an in-flight turn instead of being dropped;
   * autonomous turns are skipped when the agent is already busy.
   */
  public async think(prompt: string, options: ThinkOptions = {}): Promise<ThinkResult> {
    if (options.isChat) {
      while (this.inflight) await this.inflight
    } else if (this.isThinking) {
      return SKIPPED
    }
    return this.run(prompt, options)
  }

  public spark(): Promise<ThinkResult> {
    return this.runAutonomous(
      SPARK_KEY,
      "Start the project by proposing initial tasks.",
      () => this.dependencies.project.snapshot().tasks.length > 0,
    )
  }

  public executeTask(taskId: string): Promise<ThinkResult> {
    return this.runAutonomous(taskId, `Proceed with task: ${taskId}`, () => {
      const task = this.dependencies.project.getTask(taskId)
      return !task || task.status === "done" || task.status === "on_hold"
    })
  }

  public concludeProject(): Promise<ThinkResult> {
    if (this.dependencies.project.isAwaitingOutputReview()) return Promise.resolve(SKIPPED)
    return this.runAutonomous(
      CONCLUDE_KEY,
      "All tasks are complete! Use the deliver_project tool to fulfill the final delivery with the project result.",
      () =>
        this.dependencies.project.snapshot().phase !== "working" ||
        this.dependencies.project.isAwaitingOutputReview(),
    )
  }

  public appendHistory(message: AgentMessage): void {
    this.dependencies.project.appendHistory(this.host.data.index, message)
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    this.controller?.abort()
    for (const wake of this.waiters) wake()
  }

  private async run(prompt: string, options: ThinkOptions): Promise<ThinkResult> {
    if (this.disposed) return SKIPPED
    const turn = this.callModel(prompt, options)
    this.inflight = turn
    try {
      return await turn
    } finally {
      this.inflight = null
      this.host.simulation?.processScheduledTasks()
    }
  }

  /**
   * One request to the model, then its tool calls. History is append-only: the current project context is added
   * as a new internal turn only when it changed, the model's reply is stored exactly as returned, and every tool
   * call is answered by a tool result (failures included) in one user turn, so the next request is valid for
   * Claude. A response that arrives after the run was reset or this agent's task was removed is discarded.
   */
  private async callModel(prompt: string, options: ThinkOptions): Promise<ThinkResult> {
    const { project, team, events } = this.dependencies
    const agent = this.host.data
    const runId = project.snapshot().runId
    const taskId = this.host.getCurrentTaskId() ?? undefined
    const controller = new AbortController()
    this.controller = controller

    try {
      const llm = this.dependencies.createLLMClient()
      const system = team.getTeam()
      const { phase, tasks } = project.snapshot()

      this.appendContextIfChanged(buildContextText(agent, phase, project.getBrief(), tasks, system))
      if (!options.isChat) {
        project.appendHistory(agent.index, {
          role: "user",
          content: [{ type: "text", text: prompt }],
          metadata: options.silent ? { internal: true } : undefined,
        })
      }

      const toolDefinitions = getToolDefinitions(agent, system, phase)
      const request: MessagesRequest = {
        model: agent.model,
        system: buildSystemPrompt(agent, system),
        messages: toRequestMessages(project.getHistory(agent.index)),
        ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
      }

      project.logRequest({
        agentIndex: agent.index,
        agentName: agent.name,
        systemInstruction: request.system,
        contents: request.messages,
        systemTools: toolDefinitions,
        taskId,
      })

      const response = await llm.complete(request, {
        signal: controller.signal,
        timeoutMs: LLM_TIMEOUT_MS,
      })
      if (controller.signal.aborted || project.snapshot().runId !== runId) return SKIPPED

      project.logResponse({
        agentIndex: agent.index,
        agentName: agent.name,
        content: response.content,
        usage: response.usage,
        raw: { model: agent.model, servedBy: response.servedBy, stopReason: response.stopReason },
        taskId,
      })

      if (response.content.length > 0) {
        project.appendHistory(agent.index, {
          role: "assistant",
          content: response.content,
          metadata: options.silent ? { internal: true } : undefined,
        })
      }

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n\n")
      const calls = response.content.filter(
        (block): block is ToolCallBlock => block.type === "tool_call",
      )
      const results = this.runToolCalls(calls, response.stopReason, toolDefinitions, options)
      if (results.length > 0) {
        project.appendHistory(agent.index, {
          role: "user",
          content: results,
          metadata: { internal: true },
        })
      }

      return {
        text,
        toolCalls: calls.map(parseToolCall),
        refused: response.stopReason === "refusal",
      }
    } catch (caught) {
      const error = toLLMError(caught)
      if (
        error.kind === "aborted" ||
        controller.signal.aborted ||
        project.snapshot().runId !== runId
      )
        return SKIPPED

      events.llmError({ agent, kind: error.kind, message: error.message, taskId })
      if (options.isChat) {
        project.appendHistory(agent.index, {
          role: "assistant",
          content: [{ type: "text", text: `Sorry, that request failed: ${error.message}` }],
          metadata: { error: true, displayOnly: true },
        })
      }
      return { ...SKIPPED, error }
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  /** Appends the project context as an internal turn, unless the latest snapshot in history is identical. */
  private appendContextIfChanged(contextText: string): void {
    const { project } = this.dependencies
    const agentIndex = this.host.data.index
    if (lastContextText(project.getHistory(agentIndex)) === contextText) return
    project.appendHistory(agentIndex, {
      role: "user",
      content: [{ type: "text", text: contextText }],
      metadata: { internal: true, context: true },
    })
  }

  /**
   * Runs each tool call and returns one result per call, in order. A turn cut off by `max_tokens` or a refusal
   * may carry truncated input, so its calls are answered with errors instead of being run.
   */
  private runToolCalls(
    calls: readonly ToolCallBlock[],
    stopReason: StopReason,
    toolDefinitions: readonly ToolDefinition[],
    options: ThinkOptions,
  ): ToolResultBlock[] {
    const { project, team, events } = this.dependencies
    const agent = this.host.data
    const offered = new Set(toolDefinitions.map((definition) => definition.name))
    const context: ToolContext = {
      agent,
      team: team.getTeam(),
      project,
      setStatus: (status) => this.host.setState(status),
      appendHistory: (message) => project.appendHistory(agent.index, message),
    }
    const truncated = stopReason === "max_tokens" || stopReason === "refusal"

    return calls.map((call): ToolResultBlock => {
      if (truncated) {
        return {
          type: "tool_result",
          toolCallId: call.id,
          content:
            "Not run: your reply was cut off, so the arguments may be incomplete. Call the tool again.",
          isError: true,
        }
      }
      const result = runToolCall(context, parseToolCall(call), offered)
      if (result.ok && call.name === "set_user_brief" && options.isChat) {
        events.briefSet(agent.index)
      }
      return {
        type: "tool_result",
        toolCallId: call.id,
        content: result.ok ? result.summary : result.error,
        isError: !result.ok,
      }
    })
  }

  /**
   * Runs an autonomous intent (planning, a task, the final delivery) under the retry policy:
   * exponential backoff between unproductive attempts, a per-project call budget, and a pause
   * that waits for the user after repeated failures, rate limiting or a gateway access error.
   */
  private async runAutonomous(
    key: string,
    prompt: string,
    madeProgress: () => boolean,
  ): Promise<ThinkResult> {
    if (this.isThinking) return SKIPPED
    const { project } = this.dependencies
    const runId = project.snapshot().runId

    this.waiting = true
    let ready: boolean
    try {
      ready = await this.waitForTurn(key, runId)
    } finally {
      this.waiting = false
    }
    if (!ready) return SKIPPED
    while (this.inflight) await this.inflight
    if (this.disposed) return SKIPPED

    const result = await this.run(prompt, { silent: true })
    if (project.snapshot().runId !== runId) return result

    if (madeProgress()) {
      project.clearIntentAttempts(key)
      return result
    }
    project.recordIntentAttempt(key, result.error?.message)
    if (result.error && project.getTask(key)) project.setTaskError(key, result.error.message)

    const kind = result.error?.kind
    if (kind === "rate_limited" || kind === "not_configured" || kind === "unauthorized") {
      project.pauseAutonomy({
        kind: kind === "rate_limited" ? "quota" : "auth",
        reason:
          kind === "rate_limited"
            ? "The model provider is rate limiting requests. Resume once it allows more calls."
            : kind === "unauthorized"
              ? "You are not signed in to the model gateway. Agents resume when you sign in."
              : "The model gateway is not configured. Agents resume when it is.",
        agentIndex: this.host.data.index,
      })
    }
    return result
  }

  /** Resolves true when the intent may call the model, false if the run ended while waiting. */
  private async waitForTurn(key: string, runId: number): Promise<boolean> {
    const { project } = this.dependencies
    for (;;) {
      if (this.disposed) return false
      const snapshot = project.snapshot()
      if (snapshot.runId !== runId || snapshot.phase !== "working") return false

      if (snapshot.autonomyPause) {
        await this.waitFor((snapshot) => snapshot.runId !== runId || !snapshot.autonomyPause)
        continue
      }

      const budget = project.getCallBudget()
      if (budget.used >= budget.limit) {
        project.pauseAutonomy({
          kind: "budget",
          reason: `Agents made ${budget.used} model calls in this project. Resume to allow ${LLM_CALL_BUDGET} more.`,
        })
        continue
      }

      const attempts = project.getIntentAttempts(key)
      if (attempts && attempts.count >= MAX_INTENT_ATTEMPTS) {
        const task = project.getTask(key)
        project.pauseAutonomy({
          kind: "failures",
          reason: `${this.host.data.name} made no progress on ${task ? `"${task.title}"` : "the project"} after ${attempts.count} attempts${attempts.lastError ? `: ${attempts.lastError}` : "."}`,
          taskId: task?.id,
          agentIndex: this.host.data.index,
        })
        continue
      }

      const delay = attempts
        ? backoffDelayMs(attempts.count) - (Date.now() - attempts.lastAttemptAt)
        : 0
      if (delay <= 0) return true
      await this.waitFor((snapshot) => snapshot.runId !== runId, delay)
    }
  }

  /** Waits until the predicate holds for a project change, the timeout elapses, or the brain is disposed. */
  private waitFor(
    predicate: (snapshot: ProjectSnapshot) => boolean,
    timeoutMs?: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const done = () => {
        clearTimeout(timer)
        unsubscribe()
        this.waiters.delete(done)
        resolve()
      }
      const unsubscribe = this.dependencies.project.subscribe((next) => {
        if (predicate(next)) done()
      })
      this.waiters.add(done)
      if (timeoutMs !== undefined) timer = setTimeout(done, timeoutMs)
    })
  }

  /** Keeps the host's lifecycle in step with the board: resets, reviews and removed tasks release the agent. */
  private onProjectChange(next: ProjectSnapshot, previous: ProjectSnapshot): void {
    const host = this.host
    if (next.runId !== previous.runId) {
      this.controller?.abort()
      if (host.state !== "idle" || host.getCurrentTaskId()) host.setTask(null)
      return
    }
    if (next.tasks === previous.tasks) return

    const currentTaskId = host.getCurrentTaskId()
    if (currentTaskId && !next.tasks.some((task) => task.id === currentTaskId)) {
      this.controller?.abort()
      host.setTask(null)
      return
    }
    if (
      host.state === "on_hold" &&
      !next.tasks.some(
        (task) => task.assignedAgentId === host.data.index && task.status === "on_hold",
      )
    ) {
      host.setTask(null)
    }
  }
}
