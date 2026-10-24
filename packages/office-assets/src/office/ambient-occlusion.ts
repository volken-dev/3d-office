import type { MergedGeometry } from "./draw-call-merge.ts"
import { buildTriangleBvh, nearestHit } from "./triangle-bvh.ts"
import {
  addVectors,
  crossProduct,
  normalizeVector,
  scaleVector,
  type Vector3,
} from "./vector-math.ts"

const AO_RAYS = 24
/** Rays look this far (metres); a hit's weight falls off as 1 - (t / AO_DISTANCE)^2. */
const AO_DISTANCE = 0.7
const AO_STRENGTH = 0.6
/** Ray origins are lifted off the surface by this much along the normal. */
const AO_OFFSET = 0.004

/** Nodes that cast occlusion: everything but the navmesh, the skies, glass, the border and anim-*. */
function occludes(node: string): boolean {
  return (
    !["navMesh", "day-only-sky", "night-only-sky", "static-glass", "colored-border"].includes(
      node,
    ) && !node.startsWith("anim-")
  )
}

/** Nodes that receive baked AO: the static opaque nodes, not glass or screen faces. */
function receivesOcclusion(node: string): boolean {
  return node.startsWith("static-") && !["static-glass", "static-screens"].includes(node)
}

/**
 * Cosine-weighted hemisphere directions (Hammersley), in a frame with +z along the normal. The
 * same set for every vertex, with AO snapped to 1/32 steps: smooth, low-entropy colours that
 * meshopt compresses far better than per-vertex jittered ones.
 */
function hemisphereDirections(): Vector3[] {
  return Array.from({ length: AO_RAYS }, (_, k): Vector3 => {
    let bits = k
    let radical = 0
    let fraction = 0.5
    while (bits) {
      if (bits & 1) radical += fraction
      bits >>= 1
      fraction /= 2
    }
    const angle = 2 * Math.PI * ((k + 0.5) / AO_RAYS)
    const radius = Math.sqrt(radical)
    return [radius * Math.cos(angle), radius * Math.sin(angle), Math.sqrt(1 - radical)]
  })
}

/** What the AO bake did, for the build log. */
export interface AmbientOcclusionReport {
  vertices: number
  rays: number
  triangles: number
}

/**
 * Bakes ambient occlusion into vertex colours (`COLOR_0` = 1 - strength x the weighted hit
 * fraction) for every receiving node, casting hemisphere rays from each vertex against all
 * occluding triangles. Sets `colors` on the receivers' merged geometry.
 */
export function bakeAmbientOcclusion(
  nodes: Map<string, Map<string, MergedGeometry>>,
): AmbientOcclusionReport {
  const corners: number[] = []
  for (const [node, groups] of nodes) {
    if (!occludes(node)) continue
    for (const geometry of groups.values()) {
      for (let t = 0; t < geometry.indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const vertex = geometry.indices[t + k] * 3
          corners.push(
            geometry.positions[vertex],
            geometry.positions[vertex + 1],
            geometry.positions[vertex + 2],
          )
        }
      }
    }
  }
  const bvh = buildTriangleBvh(new Float32Array(corners))
  const directions = hemisphereDirections()
  let vertexTotal = 0
  for (const [node, groups] of nodes) {
    if (!receivesOcclusion(node)) continue
    for (const geometry of groups.values()) {
      const vertexCount = geometry.positions.length / 3
      const colors = new Float32Array(vertexCount * 3)
      geometry.colors = colors
      vertexTotal += vertexCount
      for (let i = 0; i < vertexCount; i++) {
        const position: Vector3 = [
          geometry.positions[i * 3],
          geometry.positions[i * 3 + 1],
          geometry.positions[i * 3 + 2],
        ]
        const normal = normalizeVector([
          geometry.normals[i * 3],
          geometry.normals[i * 3 + 1],
          geometry.normals[i * 3 + 2],
        ])
        const tangent = normalizeVector(
          crossProduct(Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], normal),
        )
        const bitangent = crossProduct(normal, tangent)
        const origin = addVectors(position, scaleVector(normal, AO_OFFSET))
        let occlusion = 0
        for (const [a, b, c] of directions) {
          const direction = addVectors(
            addVectors(scaleVector(tangent, a), scaleVector(bitangent, b)),
            scaleVector(normal, c),
          )
          const distance = nearestHit(bvh, origin, direction, AO_DISTANCE)
          if (distance >= 0) occlusion += 1 - (distance / AO_DISTANCE) ** 2
        }
        const ambient = Math.round((1 - (AO_STRENGTH * occlusion) / AO_RAYS) * 32) / 32
        colors[i * 3] = ambient
        colors[i * 3 + 1] = ambient
        colors[i * 3 + 2] = ambient
      }
    }
  }
  return { vertices: vertexTotal, rays: AO_RAYS, triangles: corners.length / 9 }
}
