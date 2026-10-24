import type { Vector3 } from "../vector3.ts"

/** One vertex of a part: its bind-pose world position and its texture coordinate. */
export interface PartVertex {
  position: Vector3
  uv: [number, number]
}

/** A piece of geometry before it is merged into a primitive: vertices and index triangles. */
export interface MeshPart {
  vertices: PartVertex[]
  triangles: [number, number, number][]
}

/**
 * A `rowCount` by `columnCount` quad grid whose seam column is duplicated (columnCount + 1
 * vertices per row), so the uv wraps cleanly. `flip` reverses the winding.
 */
export function gridPart(
  rowCount: number,
  columnCount: number,
  positionAt: (row: number, column: number) => Vector3,
  flip = false,
): MeshPart {
  const vertices: PartVertex[] = []
  const triangles: [number, number, number][] = []
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column <= columnCount; column++) {
      vertices.push({
        position: positionAt(row, column),
        uv: [column / columnCount, rowCount > 1 ? row / (rowCount - 1) : 0],
      })
    }
  }
  for (let row = 0; row < rowCount - 1; row++) {
    for (let column = 0; column < columnCount; column++) {
      const corner = row * (columnCount + 1) + column
      const nextColumn = corner + 1
      const nextRow = corner + columnCount + 1
      const diagonal = nextRow + 1
      if (flip) triangles.push([corner, nextColumn, nextRow], [nextColumn, diagonal, nextRow])
      else triangles.push([corner, nextRow, nextColumn], [nextColumn, nextRow, diagonal])
    }
  }
  return { vertices, triangles }
}

/** Moves every vertex of `part` through `transform`, in place, and returns the part. */
export function transformPart(part: MeshPart, transform: (position: Vector3) => Vector3): MeshPart {
  for (const vertex of part.vertices) vertex.position = transform(vertex.position)
  return part
}
