import type { Obstacle, PointOfInterest } from "./office-build-context.ts"
import type { OfficeLayout } from "./office-layout-schema.ts"
import type { Vector2 } from "./vector-math.ts"

/** Walk grid cell size in metres. */
const WALK_GRID_CELL = 0.1

/** Obstacles are inflated by this much: a cell is walkable for an agent's centre. */
const OBSTACLE_INFLATION = 0.14

/** Cells closer than this to the room's inner edge are never walkable. */
const ROOM_EDGE_MARGIN = 0.15

/**
 * The walk grid over the room: one cell per 0.1 m, `walkable[row][column]` 1 where an agent's
 * centre may stand (obstacles inflated), and `reachable` 1 where it is also connected to
 * `poi-idle-spawn-1`. Shipped as scene extras `nav` and as the `navMesh` node.
 */
export interface WalkGrid {
  originX: number
  originZ: number
  cell: number
  columns: number
  rows: number
  inflate: number
  walkable: Uint8Array[]
  reachable: Uint8Array[]
}

/** True when (x, z) is within `radius` of a convex polygon: inside it, or near an edge. */
function nearPolygon(points: Vector2[], x: number, z: number, radius: number): boolean {
  let inside = true
  let windingSign = 0
  for (let k = 0; k < points.length; k++) {
    const [startX, startZ] = points[k]
    const [endX, endZ] = points[(k + 1) % points.length]
    const edgeX = endX - startX
    const edgeZ = endZ - startZ
    const cross = edgeX * (z - startZ) - edgeZ * (x - startX)
    if (cross !== 0) {
      if (windingSign && Math.sign(cross) !== windingSign) inside = false
      windingSign ||= Math.sign(cross)
    }
    const along = Math.max(
      0,
      Math.min(
        1,
        ((x - startX) * edgeX + (z - startZ) * edgeZ) / (edgeX * edgeX + edgeZ * edgeZ || 1),
      ),
    )
    if (Math.hypot(x - startX - along * edgeX, z - startZ - along * edgeZ) < radius) return true
  }
  return inside
}

function blocksCell(obstacle: Obstacle, x: number, z: number): boolean {
  if (obstacle.kind === "polygon") return nearPolygon(obstacle.points, x, z, OBSTACLE_INFLATION)
  return (
    x > obstacle.minX - OBSTACLE_INFLATION &&
    x < obstacle.maxX + OBSTACLE_INFLATION &&
    z > obstacle.minZ - OBSTACLE_INFLATION &&
    z < obstacle.maxZ + OBSTACLE_INFLATION
  )
}

/** Rasterises the obstacles onto the room's walk grid; nothing is marked reachable yet. */
export function buildWalkGrid(layout: OfficeLayout, obstacles: Obstacle[]): WalkGrid {
  const {
    x: [minX, maxX],
    z: [minZ, maxZ],
  } = layout.room
  const columns = Math.round((maxX - minX) / WALK_GRID_CELL)
  const rows = Math.round((maxZ - minZ) / WALK_GRID_CELL)
  const walkable = Array.from({ length: rows }, () => new Uint8Array(columns).fill(1))
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = minX + (i + 0.5) * WALK_GRID_CELL
      const z = minZ + (j + 0.5) * WALK_GRID_CELL
      if (
        x < minX + ROOM_EDGE_MARGIN ||
        x > maxX - ROOM_EDGE_MARGIN ||
        z < minZ + ROOM_EDGE_MARGIN ||
        z > maxZ - ROOM_EDGE_MARGIN
      ) {
        walkable[j][i] = 0
      }
      for (const obstacle of obstacles) {
        if (blocksCell(obstacle, x, z)) {
          walkable[j][i] = 0
          break
        }
      }
    }
  }
  return {
    originX: minX,
    originZ: minZ,
    cell: WALK_GRID_CELL,
    columns,
    rows,
    inflate: OBSTACLE_INFLATION,
    walkable,
    reachable: Array.from({ length: rows }, () => new Uint8Array(columns)),
  }
}

/** The `[column, row]` of the cell containing (x, z); may be outside the grid. */
export function cellAt(grid: WalkGrid, x: number, z: number): Vector2 {
  return [Math.floor((x - grid.originX) / grid.cell), Math.floor((z - grid.originZ) / grid.cell)]
}

function insideGrid(grid: WalkGrid, column: number, row: number): boolean {
  return column >= 0 && row >= 0 && column < grid.columns && row < grid.rows
}

/** True when (x, z) is on a walkable cell. */
export function isWalkable(grid: WalkGrid, x: number, z: number): boolean {
  const [column, row] = cellAt(grid, x, z)
  return insideGrid(grid, column, row) && grid.walkable[row][column] === 1
}

/** True when (x, z) is on a cell reachable from the first spawn. */
export function isReachable(grid: WalkGrid, x: number, z: number): boolean {
  const [column, row] = cellAt(grid, x, z)
  return insideGrid(grid, column, row) && grid.reachable[row][column] === 1
}

/**
 * Marks every cell 4-connected to `poi-idle-spawn-1`: everything an agent walks to must be
 * connected to the first spawn. Throws when the spawn itself isn't walkable.
 */
export function markReachableFromSpawn(grid: WalkGrid, pointsOfInterest: PointOfInterest[]): void {
  const spawn = pointsOfInterest.find((point) => point.name === "poi-idle-spawn-1")
  if (spawn === undefined) throw new Error("the layout has no spawns (poi-idle-spawn-1)")
  const [spawnColumn, spawnRow] = cellAt(grid, spawn.position[0], spawn.position[2])
  if (!grid.walkable[spawnRow]?.[spawnColumn]) {
    throw new Error("poi-idle-spawn-1 is not on a walkable cell")
  }
  const stack: Vector2[] = [[spawnColumn, spawnRow]]
  grid.reachable[spawnRow][spawnColumn] = 1
  const neighbours: Vector2[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (let cell = stack.pop(); cell !== undefined; cell = stack.pop()) {
    const [column, row] = cell
    for (const [stepColumn, stepRow] of neighbours) {
      const nextColumn = column + stepColumn
      const nextRow = row + stepRow
      if (
        insideGrid(grid, nextColumn, nextRow) &&
        grid.walkable[nextRow][nextColumn] &&
        !grid.reachable[nextRow][nextColumn]
      ) {
        grid.reachable[nextRow][nextColumn] = 1
        stack.push([nextColumn, nextRow])
      }
    }
  }
}
