import type { Node } from "@gltf-transform/core"
import { normalizeVector, type Vector3 } from "./vector3.ts"

/** The source rig's 10 joints, in skin order. Their clips' body channels are never modified. */
export const RIG_BONES = [
  "root",
  "hips",
  "leg.L",
  "leg.R",
  "spine",
  "head",
  "arm.L",
  "lower.arm.L",
  "arm.R",
  "lower.arm.R",
] as const

/** One of {@link RIG_BONES}. */
export type RigBone = (typeof RIG_BONES)[number]

/**
 * Joints the generator adds after the rig's, in skin order: the two-joint antenna, then the
 * clip-only props (`zzz`, `cable`, `bubble_q` "?", `bubble_alert` "!", `hammer`) that rest at
 * scale 0 and are shown only by their clips.
 */
export const PROP_JOINTS = [
  "antenna",
  "antenna_tip",
  "zzz",
  "cable",
  "bubble_q",
  "bubble_alert",
  "hammer",
] as const

/**
 * Tool icon joints, after the props. They rest at scale 0 and no clip touches them: the product
 * scales the current tool's joint to 1 (terminal = shell commands, search = reading or searching
 * code and docs, edit = changing files, web = fetching or browsing).
 */
export const TOOL_ICON_JOINTS = ["icon_terminal", "icon_search", "icon_edit", "icon_web"] as const

/** Skin joint index by joint name, for the rig's joints and the added ones. */
export type JointIndices = ReadonlyMap<string, number>

/** A joint's bind-pose world position and its world +Y axis (the direction its bone points). */
export interface JointFrame {
  position: Vector3
  axisY: Vector3
}

/**
 * Maps every joint name to its skin index: the rig's joints as the skin lists them, then
 * {@link PROP_JOINTS} and {@link TOOL_ICON_JOINTS} appended in that order.
 */
export function buildJointIndices(rigJoints: readonly Node[]): JointIndices {
  if (rigJoints.length !== RIG_BONES.length) {
    throw new Error(`Expected a ${RIG_BONES.length}-joint rig, found ${rigJoints.length} joints`)
  }
  const indices = new Map<string, number>()
  rigJoints.forEach((joint, index) => {
    indices.set(joint.getName(), index)
  })
  for (const name of [...PROP_JOINTS, ...TOOL_ICON_JOINTS]) indices.set(name, indices.size)
  return indices
}

/** The skin index of joint `name`; throws for a joint the skin does not have. */
export function jointIndex(indices: JointIndices, name: string): number {
  const index = indices.get(name)
  if (index === undefined) throw new Error(`The rig has no joint named ${name}`)
  return index
}

/** The bind-pose world frame of rig joint `name`. */
export function jointWorldFrame(
  rigJoints: readonly Node[],
  indices: JointIndices,
  name: string,
): JointFrame {
  const matrix = rigJoints[jointIndex(indices, name)].getWorldMatrix()
  return {
    position: [matrix[12], matrix[13], matrix[14]],
    axisY: normalizeVector([matrix[4], matrix[5], matrix[6]]),
  }
}
