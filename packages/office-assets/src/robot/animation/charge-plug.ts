import { mat4, vec3 } from "gl-matrix"
import { requirePresent } from "../require-present.ts"
import { subtractVectors, type Vector3, vectorLength } from "../vector3.ts"
import type { BoneWorldMatrix } from "./forward-kinematics.ts"

/** Where the charge plug sits in the Charge pose, relative to the robot's origin. */
export interface ChargePlug {
  /** The plug's average position over the clip. */
  position: Vector3
  /** How far the plug strays from that average during the clip, in metres. */
  maxDrift: number
}

/** The plug tip's bind-pose position, at the end of the charging cable. */
const PLUG_TIP: Vector3 = [0.003, 0.395, -0.592]

/**
 * Measures the charge plug over the Charge clip (7 samples). The office layout's charge-row
 * `plug` must match the position so the cable meets the rack socket.
 */
export function measureChargePlug(
  boneWorld: BoneWorldMatrix,
  duration: number,
  spineBindWorld: mat4,
): ChargePlug {
  const inverseSpineBind = requirePresent(
    mat4.invert(mat4.create(), spineBindWorld),
    "an invertible spine bind matrix",
  )
  const samples: number[][] = []
  for (let sample = 0; sample <= 6; sample++) {
    const skinning = mat4.multiply(
      mat4.create(),
      boneWorld("spine", (sample * duration) / 6),
      inverseSpineBind,
    )
    samples.push(Array.from(vec3.transformMat4(vec3.create(), PLUG_TIP, skinning)))
  }
  const [x, y, z] = [0, 1, 2].map(
    (axis) => samples.reduce((sum, point) => sum + point[axis], 0) / samples.length,
  )
  const position: Vector3 = [x, y, z]
  const maxDrift = Math.max(
    ...samples.map((point) =>
      vectorLength(subtractVectors([point[0], point[1], point[2]], position)),
    ),
  )
  return { position, maxDrift }
}
