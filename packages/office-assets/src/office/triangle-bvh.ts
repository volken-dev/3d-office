import { crossProduct, type Vector3 } from "./vector-math.ts"

/**
 * A bounding volume hierarchy over triangles (median split on the longest axis, leaves of up to 4
 * triangles), stored as parallel arrays indexed by node id; node 0 is the root. `triangles` holds
 * nine float32 coordinates per triangle and `order` the triangle ids, leaf by leaf.
 */
export interface TriangleBvh {
  triangles: Float32Array
  order: Uint32Array
  boundsMin: number[][]
  boundsMax: number[][]
  left: number[]
  right: number[]
  start: number[]
  count: number[]
}

/** Builds the hierarchy over `triangles` (nine float32 coordinates each). */
export function buildTriangleBvh(triangles: Float32Array): TriangleBvh {
  const triangleCount = triangles.length / 9
  const order = new Uint32Array(triangleCount).map((_, index) => index)
  const centroids = new Float32Array(triangleCount * 3)
  for (let t = 0; t < triangleCount; t++) {
    for (let axis = 0; axis < 3; axis++) {
      centroids[t * 3 + axis] =
        (triangles[t * 9 + axis] + triangles[t * 9 + 3 + axis] + triangles[t * 9 + 6 + axis]) / 3
    }
  }
  const bvh: TriangleBvh = {
    triangles,
    order,
    boundsMin: [],
    boundsMax: [],
    left: [],
    right: [],
    start: [],
    count: [],
  }
  const build = (first: number, end: number): number => {
    const id = bvh.boundsMin.length
    const minimum = [Infinity, Infinity, Infinity]
    const maximum = [-Infinity, -Infinity, -Infinity]
    for (let k = first; k < end; k++) {
      const t = order[k]
      for (let vertex = 0; vertex < 3; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          const coordinate = triangles[t * 9 + vertex * 3 + axis]
          if (coordinate < minimum[axis]) minimum[axis] = coordinate
          if (coordinate > maximum[axis]) maximum[axis] = coordinate
        }
      }
    }
    bvh.boundsMin.push(minimum)
    bvh.boundsMax.push(maximum)
    bvh.left.push(-1)
    bvh.right.push(-1)
    bvh.start.push(first)
    bvh.count.push(end - first)
    if (end - first > 4) {
      const splitAxis = [0, 1, 2].reduce(
        (best, axis) =>
          maximum[axis] - minimum[axis] > maximum[best] - minimum[best] ? axis : best,
        0,
      )
      const middle = (first + end) >> 1
      const sorted = Array.from(order.subarray(first, end)).sort(
        (p, q) => centroids[p * 3 + splitAxis] - centroids[q * 3 + splitAxis] || p - q,
      )
      order.set(sorted, first)
      bvh.left[id] = build(first, middle)
      bvh.right[id] = build(middle, end)
      bvh.count[id] = 0
    }
    return id
  }
  build(0, triangleCount)
  return bvh
}

/**
 * The nearest hit distance along the ray in (1e-5, maxDistance), or -1 when nothing is hit
 * (slab test per node, Moller-Trumbore per triangle).
 */
export function nearestHit(
  bvh: TriangleBvh,
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
): number {
  const { triangles: positions, order, boundsMin, boundsMax, left, right, start, count } = bvh
  let best = maxDistance
  const stack = [0]
  const inverse = direction.map((value) => 1 / value)
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    let entry = 0
    let exit = best
    for (let axis = 0; axis < 3; axis++) {
      let near = (boundsMin[node][axis] - origin[axis]) * inverse[axis]
      let far = (boundsMax[node][axis] - origin[axis]) * inverse[axis]
      if (near > far) [near, far] = [far, near]
      if (near > entry) entry = near
      if (far < exit) exit = far
      if (entry > exit) break
    }
    if (entry > exit) continue
    if (count[node]) {
      for (let k = start[node]; k < start[node] + count[node]; k++) {
        const base = order[k] * 9
        const edge1: Vector3 = [
          positions[base + 3] - positions[base],
          positions[base + 4] - positions[base + 1],
          positions[base + 5] - positions[base + 2],
        ]
        const edge2: Vector3 = [
          positions[base + 6] - positions[base],
          positions[base + 7] - positions[base + 1],
          positions[base + 8] - positions[base + 2],
        ]
        const p = crossProduct(direction, edge2)
        const determinant = edge1[0] * p[0] + edge1[1] * p[1] + edge1[2] * p[2]
        if (Math.abs(determinant) < 1e-12) continue
        const inverseDeterminant = 1 / determinant
        const toOrigin: Vector3 = [
          origin[0] - positions[base],
          origin[1] - positions[base + 1],
          origin[2] - positions[base + 2],
        ]
        const u =
          (toOrigin[0] * p[0] + toOrigin[1] * p[1] + toOrigin[2] * p[2]) * inverseDeterminant
        if (u < 0 || u > 1) continue
        const q = crossProduct(toOrigin, edge1)
        const v =
          (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inverseDeterminant
        if (v < 0 || u + v > 1) continue
        const distance = (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]) * inverseDeterminant
        if (distance > 1e-5 && distance < best) best = distance
      }
    } else stack.push(left[node], right[node])
  }
  return best < maxDistance ? best : -1
}
