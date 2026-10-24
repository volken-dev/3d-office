import type { OfficeBuildContext } from "./office-build-context.ts"
import { agentStateEntries } from "./office-layout-schema.ts"

/** A POI pattern as a regular expression: `*` matches one name segment (no `-`). */
function patternExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^-]+")
  return new RegExp(`^${escaped}$`)
}

/**
 * Checks that the office seats every agent: one work pod per agent, every `assign: "own"` slot
 * resolving to the agent's own POI for slots 1 to `agents.max`, and every agent state holding at
 * least `agents.max` agents (counting overflow spots). `assign: "position"` (queue spots) counts
 * as many as there are. Returns each state's capacity, in layout order.
 */
export function agentStateCapacity(context: OfficeBuildContext): Record<string, number> {
  const { layout, pointsOfInterest } = context
  const maxAgents = layout.agents.max
  const desks = pointsOfInterest.filter((point) => point.name.startsWith("poi-sit_work-")).length
  if (desks !== maxAgents) throw new Error(`${desks} desks for agents.max ${maxAgents}`)
  const capacity: Record<string, number> = {}
  for (const [stateName, state] of agentStateEntries(layout)) {
    const seen = new Set<string>()
    for (const slot of state.slots) {
      for (const pattern of slot.pois) {
        if (slot.assign === "own") {
          for (let slotNumber = 1; slotNumber <= maxAgents; slotNumber++) {
            const ownName = pattern.replace("*", String(slotNumber))
            if (!pointsOfInterest.some((point) => point.name === ownName)) {
              throw new Error(`agent state ${stateName}: assign "own" needs ${ownName}`)
            }
          }
        }
        const expression = patternExpression(pattern)
        for (const point of pointsOfInterest) {
          if (expression.test(point.name)) seen.add(point.name)
        }
      }
    }
    capacity[stateName] = seen.size
    if (seen.size < maxAgents) {
      throw new Error(
        `agent state ${stateName} holds ${seen.size} agents < agents.max ${maxAgents}: add POIs or an overflow slot (poi-stand-<zone>-*)`,
      )
    }
  }
  return capacity
}
