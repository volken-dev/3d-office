import type { RigBone } from "../rig-joints.ts"
import type { Vector3 } from "../vector3.ts"

/** Euler angles in degrees (x, y, z), applied in the bone's bind-pose world axes. */
export type EulerDegrees = readonly [number, number, number]

/**
 * A pose at one moment of a clip: rotation deltas per bone on top of the base pose, and an
 * optional offset of the root's translation (hops, bobs).
 */
export type BonePose = Partial<Record<RigBone, EulerDegrees>> & { rootOffset?: Vector3 }

/** A pose as a function of the clip's normalised time (0 to 1). */
export type PoseFunction = (u: number) => BonePose
