import type { Node, Root } from "@gltf-transform/core"
import { mat4, quat } from "gl-matrix"
import { requirePresent } from "../require-present.ts"
import { RIG_BONES, type RigBone } from "../rig-joints.ts"
import type { Vector3 } from "../vector3.ts"

/** A rig bone's rest transform and bind orientation, captured before anything is added. */
export interface BoneRest {
  node: Node
  translation: Vector3
  rotation: [number, number, number, number]
  scale: Vector3
  /** The bone's bind-pose world rotation: new clips are keyed in these axes. */
  bindRotation: quat
  /** The parent bone, or null at the top of the rig's bone chain. */
  parent: RigBone | null
}

/** Every rig bone's {@link BoneRest}. */
export type RestPose = ReadonlyMap<RigBone, BoneRest>

/** The node named `name`; throws if the document has none. */
export function requireNodeByName(root: Root, name: string): Node {
  return requirePresent(
    root.listNodes().find((node) => node.getName() === name),
    `node ${name}`,
  )
}

/** Narrows a node name to a rig bone, or undefined for any other node. */
export function asRigBone(name: string): RigBone | undefined {
  return RIG_BONES.find((bone) => bone === name)
}

/** Captures the rig's rest pose (copies, so later edits to the nodes do not leak in). */
export function captureRestPose(root: Root): RestPose {
  const restPose = new Map<RigBone, BoneRest>()
  for (const bone of RIG_BONES) {
    const node = requireNodeByName(root, bone)
    const parentName = node.getParentNode()?.getName()
    restPose.set(bone, {
      node,
      translation: [...node.getTranslation()],
      rotation: [...node.getRotation()],
      scale: [...node.getScale()],
      bindRotation: mat4.getRotation(quat.create(), node.getWorldMatrix()),
      parent: parentName === undefined ? null : (asRigBone(parentName) ?? null),
    })
  }
  return restPose
}

/** The rest data of `bone`. */
export function boneRest(restPose: RestPose, bone: RigBone): BoneRest {
  return requirePresent(restPose.get(bone), `rest pose of ${bone}`)
}
