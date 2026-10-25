import type { MeshPart } from "./mesh-parts.ts"
import { type OfficeGeometry, WORLD_TRANSFORM } from "./office-geometry.ts"
import type { WalkGrid } from "./walk-grid.ts"

/** Scene extras `nav`: the walk grid as a bitset (see the `nav` convention in the extras). */
export interface NavExtras {
  origin: [number, number]
  cell: number
  cols: number
  rows: number
  inflate: number
  bits: string
}

/** The navMesh's height above the floor. */
const NAV_MESH_Y = 0.01

/** True when cells `column` to `column + width - 1` of `row` are walkable and not yet merged. */
function runIsFree(
  grid: WalkGrid,
  merged: Uint8Array[],
  row: number,
  column: number,
  width: number,
): boolean {
  for (let k = 0; k < width; k++) {
    if (!grid.walkable[row][column + k] || merged[row][column + k]) return false
  }
  return true
}

/**
 * Adds node `navMesh` (material `navmesh`): the walkable cells merged greedily into rectangles,
 * each as wide as it runs along its row, then as tall as the rows below stay free.
 */
export function addNavMesh(geometry: OfficeGeometry, grid: WalkGrid): void {
  const { columns, rows } = grid
  const merged = Array.from({ length: rows }, () => new Uint8Array(columns))
  const part: MeshPart = { positions: [], normals: [], uvs: [], indices: [] }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      if (!grid.walkable[j][i] || merged[j][i]) continue
      let width = 0
      while (i + width < columns && grid.walkable[j][i + width] && !merged[j][i + width]) width++
      let height = 1
      while (j + height < rows && runIsFree(grid, merged, j + height, i, width)) height++
      for (let a = 0; a < height; a++) for (let k = 0; k < width; k++) merged[j + a][i + k] = 1
      const x0 = grid.originX + i * grid.cell
      const x1 = x0 + width * grid.cell
      const z0 = grid.originZ + j * grid.cell
      const z1 = z0 + height * grid.cell
      const base = part.positions.length
      part.positions.push(
        [x0, NAV_MESH_Y, z1],
        [x1, NAV_MESH_Y, z1],
        [x1, NAV_MESH_Y, z0],
        [x0, NAV_MESH_Y, z0],
      )
      part.normals.push([0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0])
      part.uvs.push([0, 0], [1, 0], [1, 1], [0, 1])
      part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  geometry.push("navMesh", "navmesh", part, WORLD_TRANSFORM)
}

/** The walk grid packed for scene extras: bit k = row * cols + column, 1 = walkable. */
export function navExtras(grid: WalkGrid): NavExtras {
  const { columns, rows } = grid
  const bits = new Uint8Array(Math.ceil((columns * rows) / 8))
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const k = j * columns + i
      if (grid.walkable[j][i]) bits[k >> 3] |= 1 << (k & 7)
    }
  }
  return {
    origin: [grid.originX, grid.originZ],
    cell: grid.cell,
    cols: columns,
    rows,
    inflate: grid.inflate,
    bits: Buffer.from(bits).toString("base64"),
  }
}
