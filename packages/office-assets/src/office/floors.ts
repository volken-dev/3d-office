import type { MeshPart } from "./mesh-parts.ts"
import type { OfficeBuildContext } from "./office-build-context.ts"
import { WORLD_TRANSFORM } from "./office-geometry.ts"

/** Metres per texture repeat of a floor material (a lab tile is 2 x 2 panels). */
const FLOOR_TEXTURE_REPEAT: Readonly<Record<string, number>> = {
  floor_lab: 1.2,
  floor_lab_perf: 1.2,
}

/** Floors are a grid of about this step, so the baked AO can put soft contact shadows under furniture. */
const FLOOR_STEP = 0.25

/** Base floor height: just above the plinth top at y 0. Zone floors sit above it at 0.003. */
const BASE_FLOOR_Y = 0.0015
const ZONE_FLOOR_Y = 0.003

/**
 * A subdivided floor rectangle with world-space UVs, keeping only the grid quads whose centre
 * `keep` accepts (and only the vertices they use).
 */
function floorRectangle(
  context: OfficeBuildContext,
  material: string,
  rect: [number, number, number, number],
  y: number,
  keep: (x: number, z: number) => boolean,
): void {
  const [x0, z0, x1, z1] = rect
  const repeat = FLOOR_TEXTURE_REPEAT[material] || 1
  const columns = Math.max(1, Math.round((x1 - x0) / FLOOR_STEP))
  const rows = Math.max(1, Math.round((z1 - z0) / FLOOR_STEP))
  const grid: MeshPart = { positions: [], normals: [], uvs: [], indices: [] }
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const x = x0 + ((x1 - x0) * i) / columns
      const z = z0 + ((z1 - z0) * j) / rows
      grid.positions.push([x, y, z])
      grid.normals.push([0, 1, 0])
      grid.uvs.push([x / repeat, z / repeat])
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const corner = j * (columns + 1) + i
      const next = corner + 1
      const below = corner + columns + 1
      const belowNext = below + 1
      if (keep(x0 + ((x1 - x0) * (i + 0.5)) / columns, z0 + ((z1 - z0) * (j + 0.5)) / rows)) {
        grid.indices.push(corner, below, next, next, below, belowNext)
      }
    }
  }
  if (!grid.indices.length) return
  const remap = new Map<number, number>()
  const compact: MeshPart = { positions: [], normals: [], uvs: [], indices: [] }
  for (const index of grid.indices) {
    let compactIndex = remap.get(index)
    if (compactIndex === undefined) {
      compactIndex = compact.positions.length
      remap.set(index, compactIndex)
      compact.positions.push(grid.positions[index])
      compact.normals.push(grid.normals[index])
      compact.uvs.push(grid.uvs[index])
    }
    compact.indices.push(compactIndex)
  }
  context.geometry.push("static-architecture", material, compact, WORLD_TRANSFORM)
}

/**
 * The base floor (the room's `floor`, default `floor_lab`) only where no floored zone covers it,
 * then each floored zone's own floor above it.
 */
export function buildFloors(context: OfficeBuildContext): void {
  const { room, zones } = context.layout
  const insideFlooredZone = (x: number, z: number): boolean =>
    zones.some(
      ({ rect: [minX, minZ, maxX, maxZ], floor }) =>
        Boolean(floor) && x > minX && x < maxX && z > minZ && z < maxZ,
    )
  floorRectangle(
    context,
    room.floor || "floor_lab",
    [room.x[0], room.z[0], room.x[1], room.z[1]],
    BASE_FLOOR_Y,
    (x, z) => !insideFlooredZone(x, z),
  )
  for (const zone of zones) {
    if (zone.floor) floorRectangle(context, zone.floor, zone.rect, ZONE_FLOOR_Y, () => true)
  }
}
