import type { OfficeBuildContext } from "./office-build-context.ts"
import type { Vector2 } from "./vector-math.ts"
import { isReachable, isWalkable, type WalkGrid } from "./walk-grid.ts"

/**
 * Minimum centre-to-centre gap between standing spots, and from them to every other POI and
 * approach point: the robot is 0.84 m wide (head and arms), plus room.
 */
const ROBOT_GAP = 0.95

/**
 * Open floor required round a standing spot; with the grid's 0.14 m inflation that clears the
 * robot's 0.42 m half-width.
 */
const ROBOT_CLEAR = 0.3

/** Candidate spots are tried on this grid, inset 0.3 m from the zone's edges. */
const CANDIDATE_STEP = 0.125
const ZONE_INSET = 0.3

const STAND_WILDCARD = /^poi-stand-([a-z_]+)-\*$/

/** The zones agent states overflow into (`poi-stand-<zone>-*`), in first-mention order. */
function overflowZones(context: OfficeBuildContext): string[] {
  const zones = new Set<string>()
  for (const state of Object.values(context.layout.agentStates)) {
    if (typeof state === "string") continue
    for (const slot of state.slots) {
      for (const pattern of slot.pois) {
        const zone = pattern.match(STAND_WILDCARD)?.[1]
        if (zone) zones.add(zone)
      }
    }
  }
  return [...zones]
}

/** True when every grid sample within `radius` of (x, z) is walkable. */
function clearAround(grid: WalkGrid, x: number, z: number, radius: number): boolean {
  for (let offsetZ = -radius; offsetZ <= radius + 1e-9; offsetZ += grid.cell) {
    for (let offsetX = -radius; offsetX <= radius + 1e-9; offsetX += grid.cell) {
      if (
        offsetX * offsetX + offsetZ * offsetZ <= radius * radius + 1e-9 &&
        !isWalkable(grid, x + offsetX, z + offsetZ)
      ) {
        return false
      }
    }
  }
  return true
}

/**
 * Generates the overflow standing spots `poi-stand-<zone>-<n>` for every zone an agent state
 * overflows into: up to `agents.max` reachable, clear spots, nearest the zone's idle area first,
 * at least {@link ROBOT_GAP} from each other and from every POI and approach point (idle-area
 * markers excepted: no agent state stands there). Each faces the zone's `face`, or its focus (the
 * idle area; in a boardroom, `poi-present-1`). Their approach point is the spot itself.
 */
export function addOverflowStandSpots(
  context: OfficeBuildContext,
  grid: WalkGrid,
  approachPoints: Map<string, Vector2>,
): void {
  const { layout, pointsOfInterest } = context
  for (const zoneId of overflowZones(context)) {
    const zone = layout.zones.find((candidate) => candidate.id === zoneId)
    if (zone === undefined) {
      throw new Error(`agentStates reference poi-stand-${zoneId}-* but there is no zone ${zoneId}`)
    }
    const [minX, minZ, maxX, maxZ] = zone.rect
    const area: Vector2 = layout.areas[zoneId] || [(minX + maxX) / 2, (minZ + maxZ) / 2]
    const focus =
      zoneId === "boardroom"
        ? (pointsOfInterest.find((point) => point.name === "poi-present-1")?.position ?? [
            area[0],
            0,
            area[1],
          ])
        : [area[0], 0, area[1]]
    const taken: Vector2[] = [
      ...pointsOfInterest
        .filter((point) => !point.name.startsWith("poi-idle-area-"))
        .map((point): Vector2 => [point.position[0], point.position[2]]),
      ...approachPoints.values(),
    ]
    const candidates: Vector2[] = []
    for (let z = minZ + ZONE_INSET; z <= maxZ - ZONE_INSET + 1e-9; z += CANDIDATE_STEP) {
      for (let x = minX + ZONE_INSET; x <= maxX - ZONE_INSET + 1e-9; x += CANDIDATE_STEP) {
        if (
          isReachable(grid, x, z) &&
          clearAround(grid, x, z, ROBOT_CLEAR) &&
          taken.every(([takenX, takenZ]) => Math.hypot(x - takenX, z - takenZ) >= ROBOT_GAP)
        ) {
          candidates.push([Number(x.toFixed(3)), Number(z.toFixed(3))])
        }
      }
    }
    candidates.sort(
      (p, q) =>
        Math.hypot(p[0] - area[0], p[1] - area[1]) - Math.hypot(q[0] - area[0], q[1] - area[1]) ||
        p[0] - q[0] ||
        p[1] - q[1],
    )
    const spots: Vector2[] = []
    for (const candidate of candidates) {
      if (spots.length >= layout.agents.max) break
      if (
        spots.every(
          (spot) => Math.hypot(candidate[0] - spot[0], candidate[1] - spot[1]) >= ROBOT_GAP,
        )
      ) {
        spots.push(candidate)
      }
    }
    spots.forEach(([x, z], index) => {
      const towardX = focus[0] - x
      const towardZ = focus[2] - z
      const rotation =
        zone.face !== undefined
          ? zone.face
          : Math.hypot(towardX, towardZ) < 0.3
            ? 0
            : Number(((Math.atan2(towardX, towardZ) * 180) / Math.PI).toFixed(2))
      const name = `poi-stand-${zoneId}-${index + 1}`
      pointsOfInterest.push({ name, position: [x, 0.0025, z], rotation })
      approachPoints.set(name, [x, z])
    })
  }
}
