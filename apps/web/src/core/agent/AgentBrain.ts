import type { AgentNode } from "../../data/agents"
// TODO(#11): the last src/core -> src/integration import; delete once the orchestrator injects deps.
import { zustandOrchestrationDeps } from "../../integration/orchestration/zustandDeps"
import type { AgentWorkStatus } from "../../types"
import { LLMError, toLLMError } from "../llm/errors"
import type { LLMMessage } from "../llm/types"
import {
  backoffDelayMs,
  HISTORY_WINDOW,
  LLM_CALL_BUDGET,
  LLM_TIMEOUT_MS,
  MAX_INTENT_ATTEMPTS,
} from "../orchestration/policy"
import type { OrchestrationDeps, ProjectSnapshot } from "../orchestration/ports"
import { buildContextMessage, buildSystemPrompt } from "./PromptBuilder"
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

  /** `dependencies` defaults to the Zustand wiring so AgentHost can keep calling `new AgentBrain(this)`. */
  constructor(
    private readonly host: BrainHost,
    private readonly dependencies: OrchestrationDeps = zustandOrchestrationDeps,
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

  public appendHistory(message: LLMMessage): void {
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
   * One request to the model, then its tool calls. A failed tool call is fed back to the model as an
   * internal message so it can correct itself on its next turn. A response that arrives after the
   * run was reset or this agent's task was removed is discarded.
   */
  private async callModel(prompt: string, options: ThinkOptions): Promise<ThinkResult> {
    const { project, team, settings, events } = this.dependencies
    const agent = this.host.data
    const runId = project.snapshot().runId
    const taskId = this.host.getCurrentTaskId() ?? undefined
    const controller = new AbortController()
    this.controller = controller

    try {
      const config = settings.getLlmConfig()
      if (!config.apiKey) throw new LLMError("missing_key", "A Gemini API key is required.")
      const llm = this.dependencies.createLLMClient(config.apiKey)
      const model = agent.model || config.model
      const system = team.getTeam()
      const { phase, tasks } = project.snapshot()

      if (!options.isChat) {
        project.appendHistory(agent.index, {
          role: "user",
          content: prompt,
          metadata: options.silent ? { internal: true } : undefined,
        })
      }

      const messages = [
        buildContextMessage(agent, project.getBrief(), tasks, system),
        ...project.getHistory(agent.index).slice(-HISTORY_WINDOW),
      ]
      const systemPrompt = buildSystemPrompt(agent, phase, system)
      const toolDefinitions = getToolDefinitions(agent, system, phase)

      project.logRequest({
        agentIndex: agent.index,
        agentName: agent.name,
        systemInstruction: systemPrompt,
        contents: messages,
        systemTools: toolDefinitions,
        taskId,
      })

      const response = await llm.generateCompletion(
        messages,
        toolDefinitions,
        systemPrompt,
        model,
        {
          signal: controller.signal,
          timeoutMs: LLM_TIMEOUT_MS,
        },
      )
      if (controller.signal.aborted || project.snapshot().runId !== runId) return SKIPPED

      project.logResponse({
        agentIndex: agent.index,
        agentName: agent.name,
        content: response.content,
        tool_calls: response.tool_calls,
        usage: response.usage,
        raw: {
          model,
          modelVersion: response.modelVersion,
          responseId: response.responseId,
          finishReason: response.finishReason,
        },
        taskId,
      })

      const text = response.content ?? ""
      const toolCalls = (response.tool_calls ?? []).map(parseToolCall)
      project.appendHistory(agent.index, {
        role: "assistant",
        content: this.displayText(text, toolCalls, response.finishReason, options),
        tool_calls: response.tool_calls,
        metadata: options.silent ? { internal: true } : undefined,
      })

      const offered = new Set(toolDefinitions.map((definition) => definition.function.name))
      const toolContext: ToolContext = {
        agent,
        team: system,
        project,
        setStatus: (status) => this.host.setState(status),
        appendHistory: (message) => project.appendHistory(agent.index, message),
      }
      for (const call of toolCalls) {
        const result = runToolCall(toolContext, call, offered)
        if (!result.ok) {
          project.appendHistory(agent.index, {
            role: "user",
            content: `[SYSTEM] ${call.name} failed: ${result.error}`,
            metadata: { internal: true },
          })
        } else if (call.name === "set_user_brief" && options.isChat) {
          events.briefSet(agent.index)
        }
      }

      return { text, toolCalls }
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
          content: `Sorry, that request failed: ${error.message}`,
          metadata: { error: true },
        })
      }
      return { ...SKIPPED, error }
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  private displayText(
    text: string,
    toolCalls: ParsedToolCall[],
    finishReason: string | undefined,
    options: ThinkOptions,
  ): string {
    if (finishReason === "MALFORMED_FUNCTION_CALL")
      return "That reply was malformed, so I will try again."
    if (text || options.silent) return text
    if (toolCalls.length === 0) return "..."
    return toolCalls.some((toolCall) => toolCall.name === "set_user_brief")
      ? "Project brief set. Let's begin."
      : "Working on it..."
  }

  /**
   * Runs an autonomous intent (planning, a task, the final delivery) under the retry policy:
   * exponential backoff between unproductive attempts, a per-project call budget, and a pause
   * that waits for the user after repeated failures or a quota/auth error.
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
    if (kind === "quota" || kind === "auth" || kind === "missing_key") {
      project.pauseAutonomy({
        kind: kind === "quota" ? "quota" : "auth",
        reason:
          kind === "quota"
            ? "Gemini rejected the request for quota or rate limits. Resume once your quota allows more calls."
            : "The Gemini API key is missing or invalid. Agents resume when you save a new key.",
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
