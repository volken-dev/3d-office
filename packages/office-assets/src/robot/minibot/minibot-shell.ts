import {
  crossProduct,
  dotProduct,
  subtractVectors,
  type Vector3,
  vectorLength,
} from "../vector3.ts"

/** A minibot part: positions, analytic normals and triangle indices. */
export interface ShellPart {
  positions: Vector3[]
  normals: Vector3[]
  indices: number[]
}

function signedPower(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent
}

/** Unit vector by dividing by the length (the minibot's normals depend on this exact form). */
function normalizeByDivision(vector: Vector3): Vector3 {
  const length = vectorLength(vector) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

/**
 * A super-ellipsoid with analytic normals. `profileExponent` shapes the vertical profile and
 * `planExponent` the plan (1 = round in plan); smaller is boxier. The poles get straight down and
 * up normals. Zero-area pole slivers are dropped, and each triangle is wound to face along its
 * vertices' normals.
 */
export function superEllipsoidShell(
  center: Vector3,
  halfExtents: Vector3,
  profileExponent: number,
  planExponent: number,
  rings: number,
  sides: number,
): ShellPart {
  const positions: Vector3[] = []
  const normals: Vector3[] = []
  const indices: number[] = []
  for (let ring = 0; ring <= rings; ring++) {
    const latitude = -Math.PI / 2 + (Math.PI * ring) / rings
    const cosLatitude = Math.cos(latitude)
    const sinLatitude = Math.sin(latitude)
    for (let side = 0; side <= sides; side++) {
      const longitude = (2 * Math.PI * side) / sides
      const cosLongitude = Math.cos(longitude)
      const sinLongitude = Math.sin(longitude)
      positions.push([
        center[0] +
          halfExtents[0] *
            signedPower(cosLatitude, profileExponent) *
            signedPower(cosLongitude, planExponent),
        center[1] + halfExtents[1] * signedPower(sinLatitude, profileExponent),
        center[2] +
          halfExtents[2] *
            signedPower(cosLatitude, profileExponent) *
            signedPower(sinLongitude, planExponent),
      ])
      const gradient: Vector3 = [
        (signedPower(cosLatitude, 2 - profileExponent) *
          signedPower(cosLongitude, 2 - planExponent)) /
          halfExtents[0],
        signedPower(sinLatitude, 2 - profileExponent) / halfExtents[1],
        (signedPower(cosLatitude, 2 - profileExponent) *
          signedPower(sinLongitude, 2 - planExponent)) /
          halfExtents[2],
      ]
      normals.push(
        ring === 0 ? [0, -1, 0] : ring === rings ? [0, 1, 0] : normalizeByDivision(gradient),
      )
    }
  }
  const rowLength = sides + 1
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const corner = ring * rowLength + side
      const nextSide = corner + 1
      const nextRing = corner + rowLength
      const diagonal = nextRing + 1
      const candidates: [number, number, number][] = [
        [corner, nextRing, nextSide],
        [nextSide, nextRing, diagonal],
      ]
      for (const triangle of candidates) {
        const [first, second, third] = triangle.map((vertex) => positions[vertex])
        const faceNormal = crossProduct(
          subtractVectors(second, first),
          subtractVectors(third, first),
        )
        if (vectorLength(faceNormal) < 1e-12) continue
        const vertexNormalSum = normals[triangle[0]].map(
          (component, axis) => component + normals[triangle[1]][axis] + normals[triangle[2]][axis],
        )
        const facing = dotProduct(faceNormal, [
          vertexNormalSum[0],
          vertexNormalSum[1],
          vertexNormalSum[2],
        ])
        indices.push(...(facing < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle))
      }
    }
  }
  return { positions, normals, indices }
}
