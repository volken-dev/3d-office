/** A point or direction in metres, glTF axes (+Y up, +Z the robot's front). */
export type Vector3 = [number, number, number]

/** A read-only view of a {@link Vector3}, for parameters the function never writes. */
export type ReadonlyVector3 = readonly [number, number, number]

/** Component-wise sum. */
export function addVectors(a: ReadonlyVector3, b: ReadonlyVector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/** Component-wise difference `a - b`. */
export function subtractVectors(a: ReadonlyVector3, b: ReadonlyVector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Multiplies every component by `factor`. */
export function scaleVector(vector: ReadonlyVector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor]
}

/** Dot product. */
export function dotProduct(a: ReadonlyVector3, b: ReadonlyVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Right-handed cross product `a x b`. */
export function crossProduct(a: ReadonlyVector3, b: ReadonlyVector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Euclidean length, through `Math.hypot` (the generators' output depends on that exact routine). */
export function vectorLength(vector: ReadonlyVector3): number {
  return Math.hypot(vector[0], vector[1], vector[2])
}

/**
 * Unit vector in the same direction, by multiplying with the reciprocal length. A zero vector
 * stays zero instead of becoming NaN.
 */
export function normalizeVector(vector: ReadonlyVector3): Vector3 {
  return scaleVector(vector, 1 / (vectorLength(vector) || 1))
}
