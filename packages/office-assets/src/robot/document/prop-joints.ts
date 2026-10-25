import type { Document, Node, Root, Skin } from "@gltf-transform/core"
import { mat4, quat, vec3 } from "gl-matrix"
import type { HammerGrip } from "../parts/hammer-grip.ts"
import {
  ANTENNA_BASE,
  ANTENNA_MIDPOINT,
  CABLE_ANCHOR,
  SLEEP_LETTERS_ANCHOR,
  STATUS_GLYPH_ANCHOR,
  TOOL_ICON_ANCHOR,
} from "../prop-anchors.ts"
import { requirePresent } from "../require-present.ts"
import { RIG_BONES, TOOL_ICON_JOINTS } from "../rig-joints.ts"
import { type ReadonlyVector3, subtractVectors, type Vector3 } from "../vector3.ts"
import type { AccessorFactory } from "./accessor-factory.ts"
import { requireNodeByName } from "./rest-pose.ts"

/** The joints the generator adds to the rig, for the clips and generated layers to drive. */
export interface PropJointNodes {
  antenna: Node
  antennaTip: Node
  sleepLetters: Node
  cable: Node
  statusQuestion: Node
  statusAlert: Node
  toolIcons: Node[]
  hammer: Node
  /** The inverse of the right forearm's bind rotation: the hammer joint's rest rotation. */
  forearmInverseRotation: quat
}

/** Hidden until a clip (or, for the tool icons, the product) scales the joint up. */
const HIDDEN: Vector3 = [0, 0, 0]

function worldPosition(node: Node): Vector3 {
  const matrix = node.getWorldMatrix()
  return [matrix[12], matrix[13], matrix[14]]
}

/**
 * Adds the antenna, prop and tool icon joints to the skeleton and the skin, and extends the
 * inverse bind matrices for them. Every added joint's bind frame is world-aligned at its anchor,
 * so its inverse bind matrix is a plain translation. The hammer joint sits under the right
 * forearm with a local rotation that cancels the forearm's bind rotation, for the same reason.
 */
export function addPropJoints(
  document: Document,
  root: Root,
  skin: Skin,
  hammerGrip: HammerGrip,
  createAccessor: AccessorFactory,
): PropJointNodes {
  const headNode = requireNodeByName(root, "head")
  const headPosition = worldPosition(headNode)
  const relativeToHead = (anchor: ReadonlyVector3) => subtractVectors(anchor, headPosition)
  const antenna = document.createNode("antenna").setTranslation(relativeToHead(ANTENNA_BASE))
  const antennaTip = document
    .createNode("antenna_tip")
    .setTranslation([0, ANTENNA_MIDPOINT[1] - ANTENNA_BASE[1], 0])
  headNode.addChild(antenna)
  antenna.addChild(antennaTip)
  const sleepLetters = document
    .createNode("zzz")
    .setTranslation(relativeToHead(SLEEP_LETTERS_ANCHOR))
    .setScale(HIDDEN)
  headNode.addChild(sleepLetters)
  const spineNode = requireNodeByName(root, "spine")
  const cable = document
    .createNode("cable")
    .setTranslation(subtractVectors(CABLE_ANCHOR, worldPosition(spineNode)))
    .setScale(HIDDEN)
  spineNode.addChild(cable)
  const statusQuestion = document
    .createNode("bubble_q")
    .setTranslation(relativeToHead(STATUS_GLYPH_ANCHOR))
    .setScale(HIDDEN)
  headNode.addChild(statusQuestion)
  const statusAlert = document
    .createNode("bubble_alert")
    .setTranslation(relativeToHead(STATUS_GLYPH_ANCHOR))
    .setScale(HIDDEN)
  headNode.addChild(statusAlert)
  const toolIcons = TOOL_ICON_JOINTS.map((name) => {
    const icon = document
      .createNode(name)
      .setTranslation(relativeToHead(TOOL_ICON_ANCHOR))
      .setScale(HIDDEN)
    headNode.addChild(icon)
    return icon
  })
  const forearm = requireNodeByName(root, "lower.arm.R")
  const forearmRotation = mat4.getRotation(quat.create(), forearm.getWorldMatrix())
  const forearmInverseRotation = quat.invert(
    quat.create(),
    quat.normalize(forearmRotation, forearmRotation),
  )
  const gripFromForearm = vec3.transformQuat(
    vec3.create(),
    subtractVectors(hammerGrip.grip, worldPosition(forearm)),
    forearmInverseRotation,
  )
  const hammer = document
    .createNode("hammer")
    .setRotation([
      forearmInverseRotation[0],
      forearmInverseRotation[1],
      forearmInverseRotation[2],
      forearmInverseRotation[3],
    ])
    .setScale(HIDDEN)
    .setTranslation([gripFromForearm[0], gripFromForearm[1], gripFromForearm[2]])
  forearm.addChild(hammer)

  const rigInverseBinds = requirePresent(
    requirePresent(skin.getInverseBindMatrices(), "inverse bind matrices").getArray(),
    "inverse bind matrix data",
  )
  const firstAddedJoint = RIG_BONES.length
  const anchors: [number, ReadonlyVector3][] = [
    [firstAddedJoint, ANTENNA_BASE],
    [firstAddedJoint + 1, ANTENNA_MIDPOINT],
    [firstAddedJoint + 2, SLEEP_LETTERS_ANCHOR],
    [firstAddedJoint + 3, CABLE_ANCHOR],
    [firstAddedJoint + 4, STATUS_GLYPH_ANCHOR],
    [firstAddedJoint + 5, STATUS_GLYPH_ANCHOR],
    [firstAddedJoint + 6, hammerGrip.grip],
    ...TOOL_ICON_JOINTS.map((_, icon): [number, ReadonlyVector3] => [
      firstAddedJoint + 7 + icon,
      TOOL_ICON_ANCHOR,
    ]),
  ]
  const inverseBinds = new Float32Array((firstAddedJoint + 7 + TOOL_ICON_JOINTS.length) * 16)
  inverseBinds.set(rigInverseBinds.subarray(0, firstAddedJoint * 16))
  for (const [joint, anchor] of anchors) {
    const translation = mat4.fromTranslation(mat4.create(), [-anchor[0], -anchor[1], -anchor[2]])
    inverseBinds.set(translation, joint * 16)
  }
  skin
    .addJoint(antenna)
    .addJoint(antennaTip)
    .addJoint(sleepLetters)
    .addJoint(cable)
    .addJoint(statusQuestion)
    .addJoint(statusAlert)
    .addJoint(hammer)
  for (const icon of toolIcons) skin.addJoint(icon)
  skin.setInverseBindMatrices(createAccessor("MAT4", inverseBinds))
  return {
    antenna,
    antennaTip,
    sleepLetters,
    cable,
    statusQuestion,
    statusAlert,
    toolIcons,
    hammer,
    forearmInverseRotation,
  }
}
