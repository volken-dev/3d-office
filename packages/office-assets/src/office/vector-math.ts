/** A point or direction in world or local space: metres, +y up. */
export type Vector3 = [number, number, number]

/** A point on the floor plan `[x, z]`, or a texture coordinate `[u, v]`. */
export type Vector2 = [number, number]

/** A quaternion `[x, y, z, w]`. */
export type Quaternion = [number, number, number, number]

/** Component-wise sum. */
export function addVectors(first: Vector3, second: Vector3): Vector3 {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]]
}

/** Component-wise difference `first - second`. */
export function subtractVectors(first: Vector3, second: Vector3): Vector3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]]
}

/** The vector scaled by a scalar. */
export function scaleVector(vector: Vector3, scale: number): Vector3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale]
}

/** The cross product `first x second`. */
export function crossProduct(first: Vector3, second: Vector3): Vector3 {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ]
}

/** Euclidean length (`Math.hypot`, which the byte-identical output depends on). */
export function vectorLength(vector: Vector3): number {
  return Math.hypot(...vector)
}

/** The unit vector; a zero vector stays zero rather than becoming NaN. */
export function normalizeVector(vector: Vector3): Vector3 {
  return scaleVector(vector, 1 / (vectorLength(vector) || 1))
}

/** Degrees to radians. */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** The rotation by `degrees` about +y, as a glTF quaternion. */
export function yawQuaternion(degrees: number): Quaternion {
  return [0, Math.sin(degreesToRadians(degrees) / 2), 0, Math.cos(degreesToRadians(degrees) / 2)]
}
