import type { ReadonlyVector3 } from "../vector3.ts"

/** A joint index and its influence on a vertex. */
export type JointWeight = [number, number]

/** Gives the joint influences for a bind-pose vertex position. */
export type WeightFunction = (position: ReadonlyVector3) => JointWeight[]

/** Binds every vertex fully to one joint. */
export function rigidWeights(jointIndex: number): WeightFunction {
  return () => [[jointIndex, 1]]
}

/**
 * Blends from `lowerJoint` to `upperJoint` by height: `blend(y)` is the upper joint's share. Used
 * for flexible joins (the neck, the antenna mast).
 */
export function heightBlendWeights(
  lowerJoint: number,
  upperJoint: number,
  blend: (height: number) => number,
): WeightFunction {
  return (position) => {
    const upperShare = blend(position[1])
    return [
      [lowerJoint, 1 - upperShare],
      [upperJoint, upperShare],
    ]
  }
}
