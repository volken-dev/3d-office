/**
 * The agent state names the office's asset contract defines (`agentStates` in
 * `asset-contract.json`). The scene validates them again at load; the app uses this list to type
 * the live demo, the office-agents store and the pills.
 */
export const AGENT_STATES = [
  "working",
  "shipping",
  "waiting_for_input",
  "idle",
  "paused_or_rate_limited",
  "error",
  "done",
  "arrive",
  "queued",
] as const

/** One of the contract's agent state names. */
export type AgentState = (typeof AGENT_STATES)[number]

/** Narrows a state name reported by the scene to a known contract state. */
export function isAgentState(value: string): value is AgentState {
  return AGENT_STATES.some((state) => state === value)
}
