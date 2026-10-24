import {
  addVectors,
  crossProduct,
  normalizeVector,
  subtractVectors,
  type Vector3,
  vectorLength,
} from "../vector3.ts"
import type { PrimitiveBuffers } from "./mesh-accumulator.ts"

/**
 * Smooth vertex normals: area-weighted face normals summed over vertices that share a part and a
 * position (to 0.05 mm), so grid seams and pole vertices shade as one. Faces that cancel out (a
 * glyph's front and back copies) give a zero sum; those vertices fall back to straight up.
 */
export function smoothNormals(buffers: PrimitiveBuffers): Float32Array {
  const { positions, indices, partIds } = buffers
  const weldKey = (vertex: number) =>
    `${partIds[vertex]}|${Math.round(positions[vertex * 3] * 2e4)}|${Math.round(positions[vertex * 3 + 1] * 2e4)}|${Math.round(positions[vertex * 3 + 2] * 2e4)}`
  const positionOf = (vertex: number): Vector3 => [
    positions[vertex * 3],
    positions[vertex * 3 + 1],
    positions[vertex * 3 + 2],
  ]
  const sums = new Map<string, Vector3>()
  for (let corner = 0; corner < indices.length; corner += 3) {
    const [a, b, c] = [indices[corner], indices[corner + 1], indices[corner + 2]]
    const faceNormal = crossProduct(
      subtractVectors(positionOf(b), positionOf(a)),
      subtractVectors(positionOf(c), positionOf(a)),
    )
    for (const vertex of [a, b, c]) {
      const key = weldKey(vertex)
      const sum = sums.get(key) || [0, 0, 0]
      sums.set(key, addVectors(sum, faceNormal))
    }
  }
  const normals = new Float32Array(positions.length)
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const sum = sums.get(weldKey(vertex))
    const normal = sum && vectorLength(sum) > 1e-12 ? normalizeVector(sum) : [0, 1, 0]
    normals.set(normal, vertex * 3)
  }
  return normals
}
