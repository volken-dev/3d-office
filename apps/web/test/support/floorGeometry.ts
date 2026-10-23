import * as THREE from "three/webgpu"

/** An axis-aligned rectangle on the ground plane, in world units. */
export interface FloorRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/**
 * A flat, upward-facing floor made of 0.5-unit cells covering `area`, minus every cell inside one
 * of `holes`. Stands in for the office GLB's hidden navmesh geometry.
 */
export function buildFloorGeometry(area: FloorRect, holes: FloorRect[] = []): THREE.BufferGeometry {
  const cellSize = 0.5
  const positions: number[] = []
  const indices: number[] = []
  for (let x = area.minX; x < area.maxX; x += cellSize) {
    for (let z = area.minZ; z < area.maxZ; z += cellSize) {
      const centerX = x + cellSize / 2
      const centerZ = z + cellSize / 2
      const inHole = holes.some(
        (hole) =>
          centerX > hole.minX && centerX < hole.maxX && centerZ > hole.minZ && centerZ < hole.maxZ,
      )
      if (inHole) continue
      const first = positions.length / 3
      positions.push(x, 0, z, x + cellSize, 0, z, x + cellSize, 0, z + cellSize, x, 0, z + cellSize)
      indices.push(first, first + 2, first + 1, first, first + 3, first + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}
