import type { PointOfInterest } from "./office-build-context.ts"
import { degreesToRadians, type Vector2 } from "./vector-math.ts"
import { isReachable, type WalkGrid } from "./walk-grid.ts"

/** POIs an agent may stop short of (seats and docking bays); every other POI must be walkable. */
const SEAT_OR_DOCK = /^poi-(sit_[a-z]+|charge)-/

/**
 * The approach point of a POI: where an agent stops walking before it sits or plugs in, or the POI
 * itself when that is reachable. A seat or dock tries in front first (open for charge pads; a desk
 * or table blocks it at pod, console and meeting seats), then behind, then the sides, then rings
 * out to 1.2 m. Throws when a standing POI is off the grid or nothing within 1.2 m is reachable.
 */
export function approachPoint(grid: WalkGrid, point: PointOfInterest): Vector2 {
  const [x, , z] = point.position
  const forward = [
    Math.sin(degreesToRadians(point.rotation)),
    Math.cos(degreesToRadians(point.rotation)),
  ]
  const right = [
    Math.cos(degreesToRadians(point.rotation)),
    -Math.sin(degreesToRadians(point.rotation)),
  ]
  if (isReachable(grid, x, z)) return [x, z]
  if (!SEAT_OR_DOCK.test(point.name)) {
    throw new Error(
      `${point.name} is a standing spot but isn't on the walk grid reachable from poi-idle-spawn-1`,
    )
  }
  const offset = (back: number, side: number): Vector2 => [
    x - forward[0] * back + right[0] * side,
    z - forward[1] * back + right[1] * side,
  ]
  const candidates: Vector2[] = [
    offset(-0.5, 0),
    offset(-0.65, 0),
    offset(0.5, 0),
    offset(0, 0.5),
    offset(0, -0.5),
    offset(0.65, 0),
    offset(0, 0.65),
    offset(0, -0.65),
    offset(0.5, 0.4),
    offset(0.5, -0.4),
  ]
  for (let radius = 0.1; radius <= 1.2 + 1e-9; radius += 0.1) {
    for (let k = 0; k < 24; k++) {
      const angle = (2 * Math.PI * k) / 24
      candidates.push([x + radius * Math.cos(angle), z + radius * Math.sin(angle)])
    }
  }
  const hit = candidates.find(([candidateX, candidateZ]) =>
    isReachable(grid, candidateX, candidateZ),
  )
  if (hit === undefined) throw new Error(`${point.name}: no reachable approach point within 1.2 m`)
  return [Number(hit[0].toFixed(3)), Number(hit[1].toFixed(3))]
}
