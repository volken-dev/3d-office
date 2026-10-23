import { type Intent, nextAutonomyStep, pauseForError } from "../orchestration/autonomy"
import type { OrchestrationDeps, ProjectSnapshot } from "../orchestration/ports"
import type { AgentWorkStatus } from "../project/types"
import type { AgentNode } from "../team"
import { reactToBoardChange } from "./boardReaction"
import { runModelTurn, SKIPPED, type TurnOutcome, type TurnTrigger } from "./modelTurn"

/** What the brain needs from the agent runtime that owns it (AgentHost). */
export interface BrainHost {
  readonly data: AgentNode
  readonly state: AgentWorkStatus
  setState(state: AgentWorkStatus): void
  setTask(taskId: string | null): void
  getCurrentTaskId(): string | null
  /** Called after every model turn settles, so the runtime can start work that was waiting for this agent. */
  onTurnSettled(): void
}

const SPARK_KEY = "spark"
const CONCLUDE_KEY = "conclude"

/**
 * One agent's model turns. Turns run one at a time: a chat message queues behind a turn in flight,
 * while autonomous work is skipped when the agent is busy. Owns the single retry/backoff/budget loop
 * for autonomous work (decisions in `orchestration/autonomy`), and cancels the call in flight when
 * the run resets or the agent's task disappears.
 */
export class AgentBrain {
  private turnQueue: Promise<unknown> = Promise.resolve()
  private queuedTurns = 0
  /** An autonomous intent is waiting for backoff, budget or a resume before it queues a turn. */
  private awaitingTurn = false
  private controller: AbortController | null = null
  private disposed = false
  private readonly wakers = new Set<() => void>()
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
    return this.queuedTurns > 0 || this.awaitingTurn
  }

  /**
   * Records the user's message and replies to it. The message is recorded when its turn starts, so
   * it never lands in the middle of another turn's request and reply.
   */
  public chat(text: string): Promise<TurnOutcome> {
    return this.queueTurn({ kind: "chat", text }, () => this.dependencies.project.snapshot().runId)
  }

  public spark(): Promise<TurnOutcome> {
    return this.runIntent({
      key: SPARK_KEY,
      prompt: "Start the project by proposing initial tasks.",
      isSettled: () => this.dependencies.project.snapshot().tasks.length > 0,
    })
  }

  public executeTask(taskId: string): Promise<TurnOutcome> {
    return this.runIntent({
      key: taskId,
      taskId,
      prompt: `Proceed with task: ${taskId}`,
      isSettled: () => {
        const task = this.dependencies.project.getTask(taskId)
        return !task || task.status === "done" || task.status === "on_hold"
      },
    })
  }

  public concludeProject(): Promise<TurnOutcome> {
    const { project } = this.dependencies
    if (project.isAwaitingOutputReview()) return Promise.resolve(SKIPPED)
    return this.runIntent({
      key: CONCLUDE_KEY,
      prompt:
        "All tasks are complete. Use the deliver_project tool to fulfill the final delivery with the project result.",
      isSettled: () => project.snapshot().phase !== "working" || project.isAwaitingOutputReview(),
    })
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    this.controller?.abort()
    for (const wake of this.wakers) wake()
  }

  /** Runs a turn after every turn queued before it. `runIdAtStart` is read when the turn starts. */
  private queueTurn(trigger: TurnTrigger, runIdAtStart: () => number): Promise<TurnOutcome> {
    this.queuedTurns++
    const outcome = this.turnQueue.then(() =>
      this.disposed ? SKIPPED : this.runTurn(trigger, runIdAtStart()),
    )
    this.turnQueue = outcome.catch(() => undefined)
    return outcome.finally(() => {
      this.queuedTurns--
      if (!this.disposed) this.host.onTurnSettled()
    })
  }

  private async runTurn(trigger: TurnTrigger, runId: number): Promise<TurnOutcome> {
    const controller = new AbortController()
    this.controller = controller
    try {
      return await runModelTurn(this.dependencies, {
        agent: this.host.data,
        trigger,
        runId,
        taskId: this.host.getCurrentTaskId() ?? undefined,
        signal: controller.signal,
        setStatus: (status) => this.host.setState(status),
      })
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  /**
   * Runs an autonomous intent under the retry policy: wait until the gate allows a call, make one
   * turn, then clear the intent's attempts if it made progress, or record the attempt and pause for
   * errors that retrying cannot fix.
   */
  private async runIntent(intent: Intent): Promise<TurnOutcome> {
    if (this.isThinking) return SKIPPED
    const { project } = this.dependencies
    const runId = project.snapshot().runId

    this.awaitingTurn = true
    let mayCall: boolean
    try {
      mayCall = await this.awaitTurn(intent, runId)
    } finally {
      this.awaitingTurn = false
    }
    if (!mayCall) return SKIPPED

    const outcome = await this.queueTurn({ kind: "intent", prompt: intent.prompt }, () => runId)
    if (project.snapshot().runId !== runId) return outcome
    if (intent.isSettled()) {
      project.clearIntentAttempts(intent.key)
      return outcome
    }

    const error = outcome.status === "failed" ? outcome.error : undefined
    project.recordIntentAttempt(intent.key, error?.message)
    if (!error) return outcome
    if (intent.taskId) project.setTaskError(intent.taskId, error.message)
    const pause = pauseForError(error.kind, this.host.data.index)
    if (pause) project.pauseAutonomy(pause)
    return outcome
  }

  /** Resolves true when the intent may call the model, false if the run ended while it waited. */
  private async awaitTurn(intent: Intent, runId: number): Promise<boolean> {
    const { project } = this.dependencies
    for (;;) {
      if (this.disposed) return false
      const step = nextAutonomyStep({
        snapshot: project.snapshot(),
        runId,
        budget: project.getCallBudget(),
        attempts: project.getIntentAttempts(intent.key),
        now: Date.now(),
        agent: this.host.data,
        task: intent.taskId ? project.getTask(intent.taskId) : undefined,
      })
      switch (step.kind) {
        case "stop":
          return false
        case "proceed":
          return true
        case "wait":
          await this.waitForChange((snapshot) => snapshot.runId !== runId, step.delayMs)
          break
        case "await_resume":
          if (step.pause) project.pauseAutonomy(step.pause)
          await this.waitForChange(
            (snapshot) => snapshot.runId !== runId || snapshot.autonomyPause === null,
          )
          break
      }
    }
  }

  /** Waits until a project change satisfies the predicate, the timeout elapses, or the brain is disposed. */
  private waitForChange(
    predicate: (snapshot: ProjectSnapshot) => boolean,
    timeoutMs?: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const wake = () => {
        clearTimeout(timer)
        unsubscribe()
        this.wakers.delete(wake)
        resolve()
      }
      const unsubscribe = this.dependencies.project.subscribe((next) => {
        if (predicate(next)) wake()
      })
      this.wakers.add(wake)
      if (timeoutMs !== undefined) timer = setTimeout(wake, timeoutMs)
    })
  }

  private onProjectChange(next: ProjectSnapshot, previous: ProjectSnapshot): void {
    const { abortTurn, releaseHost } = reactToBoardChange(next, previous, {
      agentIndex: this.host.data.index,
      state: this.host.state,
      currentTaskId: this.host.getCurrentTaskId(),
    })
    if (abortTurn) this.controller?.abort()
    if (releaseHost) this.host.setTask(null)
  }
}
