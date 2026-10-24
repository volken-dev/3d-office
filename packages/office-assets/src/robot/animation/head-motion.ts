import { mat4, quat, vec3 } from "gl-matrix"
import type { ReadonlyVector3 } from "../vector3.ts"
import type { BoneWorldMatrix } from "./forward-kinematics.ts"

/** The head's motion over one pass of a clip, sampled finely and expressed in the head's frame. */
export interface HeadMotion {
  sampleCount: number
  /** Seconds between samples. */
  timeStep: number
  /** Wraps a sample index round the loop, or clamps it for a one-shot. */
  wrapIndex: (index: number) => number
  /** The antenna base's linear acceleration, in the head's frame. */
  antennaAcceleration: number[][]
  /** The head's angular velocity, in the head's frame. */
  angularVelocity: number[][]
  /** The head's angular acceleration, in the head's frame. */
  angularAcceleration: number[][]
  /** The head's vertical acceleration in world space (drives the squash). */
  verticalAcceleration: number[]
}

function rotateByQuaternion(rotation: quat, vector: readonly number[]): number[] {
  return Array.from(vec3.transformQuat(vec3.create(), vector, rotation))
}

/**
 * Samples the head at 240 per second over the clip and differentiates by central differences:
 * the antenna base's acceleration and the head's angular velocity and acceleration (both in the
 * head's frame), and its vertical acceleration. Loops wrap at the ends; one-shots clamp.
 */
export function sampleHeadMotion(
  boneWorld: BoneWorldMatrix,
  duration: number,
  antennaBaseFromHead: ReadonlyVector3,
  oneShot: boolean,
): HeadMotion {
  const sampleCount = Math.max(240, Math.round(duration * 240))
  const timeStep = duration / sampleCount
  const antennaPositions: number[][] = []
  const headPositions: number[][] = []
  const headRotations: quat[] = []
  for (let sample = 0; sample < sampleCount; sample++) {
    const matrix = boneWorld("head", sample * timeStep)
    const rotation = mat4.getRotation(quat.create(), matrix)
    quat.normalize(rotation, rotation)
    headRotations.push(rotation)
    headPositions.push([matrix[12], matrix[13], matrix[14]])
    antennaPositions.push(
      Array.from(vec3.transformMat4(vec3.create(), antennaBaseFromHead, matrix)),
    )
  }
  const wrapIndex = oneShot
    ? (index: number) => Math.max(0, Math.min(sampleCount - 1, index))
    : (index: number) => ((index % sampleCount) + sampleCount) % sampleCount
  const antennaAcceleration: number[][] = []
  const angularVelocity: number[][] = []
  const verticalAcceleration: number[] = []
  for (let sample = 0; sample < sampleCount; sample++) {
    const next = wrapIndex(sample + 1)
    const previous = wrapIndex(sample - 1)
    const acceleration = antennaPositions[next].map(
      (value, axis) =>
        (value - 2 * antennaPositions[sample][axis] + antennaPositions[previous][axis]) /
        (timeStep * timeStep),
    )
    const inverseRotation = quat.invert(quat.create(), headRotations[sample])
    antennaAcceleration.push(rotateByQuaternion(inverseRotation, acceleration))
    verticalAcceleration.push(
      (headPositions[next][1] - 2 * headPositions[sample][1] + headPositions[previous][1]) /
        (timeStep * timeStep),
    )
    const turn = quat.multiply(
      quat.create(),
      headRotations[next],
      quat.invert(quat.create(), headRotations[previous]),
    )
    if (turn[3] < 0) quat.scale(turn, turn, -1)
    const angle = 2 * Math.acos(Math.min(1, turn[3]))
    const axisScale = Math.sqrt(Math.max(1e-12, 1 - turn[3] * turn[3]))
    const velocity =
      angle < 1e-6
        ? [0, 0, 0]
        : [turn[0] / axisScale, turn[1] / axisScale, turn[2] / axisScale].map(
            (value) => (value * angle) / (2 * timeStep),
          )
    angularVelocity.push(rotateByQuaternion(inverseRotation, velocity))
  }
  const angularAcceleration = angularVelocity.map((_, sample) =>
    angularVelocity[wrapIndex(sample + 1)].map(
      (value, axis) => (value - angularVelocity[wrapIndex(sample - 1)][axis]) / (2 * timeStep),
    ),
  )
  return {
    sampleCount,
    timeStep,
    wrapIndex,
    antennaAcceleration,
    angularVelocity,
    angularAcceleration,
    verticalAcceleration,
  }
}
