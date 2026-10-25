import type { Document, NodeIO } from "@gltf-transform/core"
import { type ChargePlug, measureChargePlug } from "./animation/charge-plug.ts"
import { clipDuration } from "./animation/clip-channels.ts"
import { forwardKinematics } from "./animation/forward-kinematics.ts"
import { addGeneratedLayers } from "./animation/generated-layers.ts"
import type { ClipContext } from "./animation/keyed-clips.ts"
import { addRobotClips } from "./animation/robot-clips.ts"
import { createAccessorFactory } from "./document/accessor-factory.ts"
import { addPropJoints } from "./document/prop-joints.ts"
import { captureRestPose, requireNodeByName } from "./document/rest-pose.ts"
import { createMaterialCache } from "./document/robot-materials.ts"
import { type MeshStats, writeRobotMeshes } from "./document/robot-meshes.ts"
import { removeSourceCharacter } from "./document/source-cleanup.ts"
import { MeshAccumulator } from "./geometry/mesh-accumulator.ts"
import { BodyBuilder } from "./parts/body-builder.ts"
import { computeHammerGrip } from "./parts/hammer-grip.ts"
import { emitRobotGeometry } from "./parts/robot-geometry.ts"
import { ANTENNA_BASE } from "./prop-anchors.ts"
import { requirePresent } from "./require-present.ts"
import { buildJointIndices, jointWorldFrame } from "./rig-joints.ts"
import type { RobotBuildOptions } from "./robot-build-options.ts"
import { subtractVectors } from "./vector3.ts"

/** A built robot, ready to write, with what the build measured. */
export interface BuiltRobot {
  document: Document
  /** Where the plug sits in the Charge pose; the office layout must match it. */
  chargePlug: ChargePlug
  /** Vertex and triangle counts per mesh. */
  meshStats: Record<string, MeshStats>
  /** One summary line per clip: length, antenna swing and head squash. */
  clipReport: string[]
}

/**
 * Builds the procedural blocky robot on the source rig's skeleton and clips: reads the rig,
 * authors the body and face in bind-pose world space, swaps them in for the source character,
 * adds the prop joints and the 12 new clips, and gives every clip its generated antenna, squash
 * and face layers. Deterministic: the same rig and options give the same bytes.
 */
export async function buildRobot(
  io: NodeIO,
  rigPath: string,
  options: RobotBuildOptions,
): Promise<BuiltRobot> {
  const document = await io.read(rigPath)
  const root = document.getRoot()
  const skin = requirePresent(root.listSkins()[0], "skin in the rig")
  const rigJoints = skin.listJoints()
  const indices = buildJointIndices(rigJoints)
  const tessellation = { lite: options.lite, meshDensity: options.meshDensity }

  const accumulator = new MeshAccumulator(options.lite)
  const body = new BodyBuilder(accumulator, tessellation, rigJoints, indices)
  const hammerGrip = computeHammerGrip(jointWorldFrame(rigJoints, indices, "lower.arm.R"))
  const faceTargets = emitRobotGeometry(body, hammerGrip)

  removeSourceCharacter(root)
  const restPose = captureRestPose(root)
  const headNode = requireNodeByName(root, "head")
  const headWorld = headNode.getWorldMatrix()
  const spineBindWorld = requireNodeByName(root, "spine").getWorldMatrix()
  const createAccessor = createAccessorFactory(
    document,
    requirePresent(root.listBuffers()[0], "buffer in the rig"),
  )
  const props = addPropJoints(document, root, skin, hammerGrip, createAccessor)

  const meshes = writeRobotMeshes(
    document,
    accumulator,
    faceTargets,
    createMaterialCache(document, options.palette),
    createAccessor,
    requireNodeByName(root, "Armature"),
    skin,
  )

  const context: ClipContext = { document, createAccessor, restPose }
  addRobotClips(context, props)

  const layerTargets = {
    antenna: props.antenna,
    antennaTip: props.antennaTip,
    head: headNode,
    face: requirePresent(meshes.nodes.get("face"), "face mesh node"),
    antennaBaseFromHead: subtractVectors(ANTENNA_BASE, [
      headWorld[12],
      headWorld[13],
      headWorld[14],
    ]),
  }
  let chargePlug: ChargePlug | null = null
  const clipReport: string[] = []
  for (const animation of root.listAnimations()) {
    const duration = clipDuration(animation)
    const boneWorld = forwardKinematics(animation, restPose)
    if (animation.getName() === "Charge") {
      chargePlug = measureChargePlug(boneWorld, duration, spineBindWorld)
    }
    clipReport.push(addGeneratedLayers(context, animation, duration, boneWorld, layerTargets))
  }

  root.getAsset().generator = "procedural blocky robot (gltf-transform)"
  return {
    document,
    chargePlug: requirePresent(chargePlug, "Charge clip"),
    meshStats: meshes.stats,
    clipReport,
  }
}
