import type { JointFrame } from "../rig-joints.ts"
import { addVectors, crossProduct, normalizeVector, scaleVector, type Vector3 } from "../vector3.ts"

/** The right fist's frame, where the hammer is held. */
export interface HammerGrip {
  /** Down the forearm, from elbow to fist. */
  forearmAxis: Vector3
  /** Across the fist. */
  sideAxis: Vector3
  /** The thumb direction: the handle runs along it. */
  thumbAxis: Vector3
  /** The grip point in the fist. */
  grip: Vector3
}

/** The hammer's grip frame in the right fist, from the right forearm's bind-pose frame. */
export function computeHammerGrip(lowerArmRight: JointFrame): HammerGrip {
  const forearmAxis = lowerArmRight.axisY
  const sideAxis = normalizeVector(crossProduct(forearmAxis, [0, 0, 1]))
  const thumbAxis = crossProduct(sideAxis, forearmAxis)
  return {
    forearmAxis,
    sideAxis,
    thumbAxis,
    grip: addVectors(lowerArmRight.position, scaleVector(forearmAxis, 0.185)),
  }
}
