import type { AgentStates } from "./office-extras"

/**
 * The kind of a POI from its node name, as the contract's `poses.poiKinds` and `transitions` key
 * it: `poi-sit_work-3` is `sit_work`, `poi-stand-lounge-2` is `stand-*`, `poi-idle-area-hub` is
 * `idle-area`.
 */
export function poiKind(poiName: string): string {
  const withoutPrefix = poiName.replace(/^poi-/, "")
  if (withoutPrefix.startsWith("stand-")) return "stand-*"
  if (withoutPrefix.startsWith("idle-area-")) return "idle-area"
  return withoutPrefix.replace(/-\d+$/, "")
}

/** A POI pattern as a regular expression: `*` matches one dash-free name segment. */
function patternExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^-]+")
  return new RegExp(`^${escaped}$`)
}

/**
 * The first free POI for an agent in a state, and the clip to loop there. Slots fill in order;
 * `own` takes the agent's own POI of the slot's kind (`poi-<kind>-<desk>`: its pod, its bay),
 * `position` does the same by queue position (a queued agent's desk is its place in the queue).
 * Returns null when the state is unknown or every candidate is taken.
 */
export function resolveSlot(
  agentStates: AgentStates,
  state: string,
  desk: number,
  taken: ReadonlySet<string>,
  poiNames: readonly string[],
): { poi: string; clip: string } | null {
  const slots = Object.hasOwn(agentStates, state) ? (agentStates[state]?.slots ?? []) : []
  for (const slot of slots) {
    for (const pattern of slot.pois) {
      const byDesk = slot.assign === "own" || slot.assign === "position"
      const candidates = byDesk
        ? [pattern.replace("*", String(desk))]
        : poiNames.filter((poiName) => patternExpression(pattern).test(poiName))
      const free = candidates.find(
        (candidate) => !taken.has(candidate) && poiNames.includes(candidate),
      )
      if (free) return { poi: free, clip: slot.clip }
    }
  }
  return null
}
