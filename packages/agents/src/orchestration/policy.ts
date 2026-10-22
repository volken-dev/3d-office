import type { AgentWorkStatus, ProjectPhase } from "../project/types"

/**
 * Messages kept per agent; older turns are trimmed at a safe boundary (see appendToHistory). Below the gateway's
 * 400-message request limit, with room for the turns one call appends.
 */
export const MAX_HISTORY_PER_AGENT = 300
export const MAX_ACTION_LOG = 200
export const MAX_DEBUG_LOG = 30

export const LLM_TIMEOUT_MS = 60_000
/** Autonomous LLM calls allowed per project before the user must confirm more spend. */
export const LLM_CALL_BUDGET = 150
export const MAX_TASKS_PER_PROJECT = 30
/** Unproductive autonomous attempts at one intent before autonomy pauses. */
export const MAX_INTENT_ATTEMPTS = 4
const BACKOFF_BASE_MS = 2_000
const BACKOFF_MAX_MS = 60_000

/** Delay before the next attempt after `failedAttempts` unproductive ones: 0, 2 s, 4 s, 8 s ... capped at 60 s. */
export function backoffDelayMs(failedAttempts: number): number {
  if (failedAttempts <= 0) return 0
  return Math.min(BACKOFF_BASE_MS * 2 ** (failedAttempts - 1), BACKOFF_MAX_MS)
}

export interface ChatAvailabilityInput {
  phase: ProjectPhase
  isLead: boolean
  status: AgentWorkStatus | undefined
}

/** One rule for who the user can talk to, shared by the UI and the simulation. */
export function canChatWith({ phase, isLead, status }: ChatAvailabilityInput): boolean {
  if (phase === "done") return false
  if (phase === "idle") return isLead
  return (status ?? "idle") === "idle"
}
