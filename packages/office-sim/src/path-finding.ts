import type { FloorPoint } from "./floor-point"
import { MinHeap } from "./min-heap"
import type { WalkGrid } from "./walk-grid"

const DIAGONAL_COST = Math.SQRT2
const OCTILE_DIAGONAL_EXTRA = DIAGONAL_COST - 1

/**
 * The route a robot walks between two floor points: A* over the walk grid (8-connected, no corner
 * cutting, octile heuristic), then string-pulled to the fewest straight segments. Ported from
 * agent-office's `viewer/agent-sim.js` so robots take the same routes as in the reference.
 *
 * @returns the points from `from` to `to` (both included), or null when `to` cannot be reached.
 */
export function findPath(grid: WalkGrid, from: FloorPoint, to: FloorPoint): FloorPoint[] | null {
  if (grid.hasClearLine(from, to)) return [from, to]
  const startCell = grid.nearestWalkableCell(...grid.cellOf(...from))
  const goalCell = grid.nearestWalkableCell(...grid.cellOf(...to))
  if (!startCell || !goalCell) return null

  const { cols, rows } = grid
  const cellCount = cols * rows
  const [goalColumn, goalRow] = goalCell
  const startIndex = startCell[1] * cols + startCell[0]
  const goalIndex = goalRow * cols + goalColumn
  const costSoFar = new Float32Array(cellCount).fill(Number.POSITIVE_INFINITY)
  const cameFrom = new Int32Array(cellCount).fill(-1)
  const closed = new Uint8Array(cellCount)

  function heuristic(cellIndex: number): number {
    const columnDistance = Math.abs((cellIndex % cols) - goalColumn)
    const rowDistance = Math.abs(Math.floor(cellIndex / cols) - goalRow)
    return (
      Math.max(columnDistance, rowDistance) +
      OCTILE_DIAGONAL_EXTRA * Math.min(columnDistance, rowDistance)
    )
  }

  const open = new MinHeap()
  costSoFar[startIndex] = 0
  open.push(heuristic(startIndex), startIndex)
  while (open.size > 0) {
    const current = open.pop()
    if (current === null) break
    if (closed[current]) continue
    closed[current] = 1
    if (current === goalIndex) break
    const column = current % cols
    const row = Math.floor(current / cols)
    const currentCost = costSoFar[current] ?? Number.POSITIVE_INFINITY
    for (let columnStep = -1; columnStep <= 1; columnStep++) {
      for (let rowStep = -1; rowStep <= 1; rowStep++) {
        if (columnStep === 0 && rowStep === 0) continue
        const neighbourColumn = column + columnStep
        const neighbourRow = row + rowStep
        if (!grid.isWalkableCell(neighbourColumn, neighbourRow)) continue
        const isDiagonal = columnStep !== 0 && rowStep !== 0
        const cutsCorner =
          isDiagonal &&
          !(
            grid.isWalkableCell(column + columnStep, row) &&
            grid.isWalkableCell(column, row + rowStep)
          )
        if (cutsCorner) continue
        const neighbour = neighbourRow * cols + neighbourColumn
        const neighbourCost = currentCost + (isDiagonal ? DIAGONAL_COST : 1)
        if (neighbourCost < (costSoFar[neighbour] ?? Number.POSITIVE_INFINITY)) {
          costSoFar[neighbour] = neighbourCost
          cameFrom[neighbour] = current
          open.push(neighbourCost + heuristic(neighbour), neighbour)
        }
      }
    }
  }
  if (!closed[goalIndex]) return null

  const waypoints: FloorPoint[] = []
  for (let cellIndex = goalIndex; cellIndex !== -1; cellIndex = cameFrom[cellIndex] ?? -1) {
    waypoints.push(grid.cellCentre(cellIndex % cols, Math.floor(cellIndex / cols)))
  }
  waypoints.reverse()
  waypoints[0] = from
  waypoints.push(to)
  return pullString(grid, waypoints)
}

/** From each kept waypoint, jumps to the furthest later waypoint still in straight sight. */
function pullString(grid: WalkGrid, waypoints: readonly FloorPoint[]): FloorPoint[] {
  const first = waypoints[0]
  if (!first) return []
  const pulled: FloorPoint[] = [first]
  let anchor = 0
  while (anchor < waypoints.length - 1) {
    let furthest = waypoints.length - 1
    while (furthest > anchor + 1 && !hasClearLineBetween(grid, waypoints, anchor, furthest)) {
      furthest--
    }
    const kept = waypoints[furthest]
    if (kept) pulled.push(kept)
    anchor = furthest
  }
  return pulled
}

function hasClearLineBetween(
  grid: WalkGrid,
  waypoints: readonly FloorPoint[],
  fromIndex: number,
  toIndex: number,
): boolean {
  const from = waypoints[fromIndex]
  const to = waypoints[toIndex]
  return from !== undefined && to !== undefined && grid.hasClearLine(from, to)
}
