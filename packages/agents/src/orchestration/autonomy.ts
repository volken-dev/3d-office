import type { LLMErrorKind } from "../llm/errors"
import type { AutonomyPause, IntentAttempts, Task } from "../project/types"
import type { AgentNode } from "../team"
import { backoffDelayMs, LLM_CALL_BUDGET, MAX_INTENT_ATTEMPTS } from "./policy"
import type { ProjectSnapshot } from "./ports"

/** One piece of autonomous work an agent attempts under the retry policy. */
export interface Intent {
  /** Key its attempts are counted under: a task id, "spark" or "conclude". */
  key: string
  prompt: string
  /** The task this intent works on, if any, so a failure can be recorded on its card. */
  taskId?: string
  /** True once the board shows the intent is no longer needed: the work happened or went away. */
  isSettled(): boolean
}

/** What the gate needs to know to decide whether an intent may call the model now. */
export interface AutonomyGateInput {
  snapshot: ProjectSnapshot
  /** The run the intent started in; a different run means the project was reset. */
  runId: number
  budget: { used: number; limit: number }
  attempts: IntentAttempts | undefined
  now: number
  agent: AgentNode
  task: Task | undefined
}

/**
 * The gate's decision. `pause` carries the pause to record before waiting for the user; when it is
 * absent the run is already paused.
 */
export type AutonomyStep =
  | { kind: "stop" }
  | { kind: "await_resume"; pause?: AutonomyPause }
  | { kind: "wait"; delayMs: number }
  | { kind: "proceed" }

/**
 * Decides the next step for an autonomous intent: stop when the run ended, wait for the user while
 * paused or once the call budget or the attempt cap is reached, back off after unproductive attempts,
 * otherwise proceed.
 */
export function nextAutonomyStep({
  snapshot,
  runId,
  budget,
  attempts,
  now,
  agent,
  task,
}: AutonomyGateInput): AutonomyStep {
  if (snapshot.runId !== runId || snapshot.phase !== "working") return { kind: "stop" }
  if (snapshot.autonomyPause) return { kind: "await_resume" }

  if (budget.used >= budget.limit) {
    return {
      kind: "await_resume",
      pause: {
        kind: "budget",
        reason: `Agents made ${budget.used} model calls in this project. Resume to allow ${LLM_CALL_BUDGET} more.`,
      },
    }
  }

  if (attempts && attempts.count >= MAX_INTENT_ATTEMPTS) {
    const subject = task ? `"${task.title}"` : "the project"
    const cause = attempts.lastError ? `: ${attempts.lastError}` : "."
    return {
      kind: "await_resume",
      pause: {
        kind: "failures",
        reason: `${agent.name} made no progress on ${subject} after ${attempts.count} attempts${cause}`,
        taskId: task?.id,
        agentIndex: agent.index,
      },
    }
  }

  const delayMs = attempts ? backoffDelayMs(attempts.count) - (now - attempts.lastAttemptAt) : 0
  return delayMs > 0 ? { kind: "wait", delayMs } : { kind: "proceed" }
}

const PAUSE_REASONS: Partial<Record<LLMErrorKind, Pick<AutonomyPause, "kind" | "reason">>> = {
  rate_limited: {
    kind: "quota",
    reason: "The model provider is rate limiting requests. Resume once it allows more calls.",
  },
  not_configured: {
    kind: "not_configured",
    reason: "The model gateway is not configured. Agents resume when it is.",
  },
}

/**
 * The pause a failed call puts autonomy into, or null when retrying with backoff is the right
 * response. Quota and configuration errors pause at once, because every retry would fail the same way.
 */
export function pauseForError(kind: LLMErrorKind, agentIndex: number): AutonomyPause | null {
  const pause = PAUSE_REASONS[kind]
  return pause ? { ...pause, agentIndex } : null
}
