import type { OfficeExtras } from "./office-extras"
import { ownEntry } from "./own-entry"

/** The agent states an office defines, in file order, for pickers and demos. */
export function agentStateNames(extras: OfficeExtras): string[] {
  return Object.keys(extras.agentStates)
}

/** Whether a name is one of the office's agent states; use it to validate states from outside. */
export function isAgentState(extras: OfficeExtras, state: string): boolean {
  return Object.hasOwn(extras.agentStates, state)
}

/**
 * The hex colour an agent in a state shows on its robot and its desk and bay lights (colour means
 * status). Throws for a state the office does not define, so a typo cannot silently paint grey.
 */
export function statusColorOf(extras: OfficeExtras, state: string): string {
  const agentState = ownEntry(extras.agentStates, state)
  if (!agentState) throw new Error(`statusColorOf: "${state}" is not an agent state of this office`)
  const colour = ownEntry(extras.statusColors.colors, agentState.color)
  if (!colour) {
    throw new Error(`statusColorOf: state "${state}" names unknown colour "${agentState.color}"`)
  }
  return colour
}
