import type { Document } from "@gltf-transform/core"
import { z } from "zod"
import type { ContractReport } from "./contract-report.ts"
import type { CharacterFile, ContractFile } from "./contract-schema.ts"

const MeshExtrasSchema = z.looseObject({ targetNames: z.array(z.string()).optional() })

type CharacterSpec = Extract<ContractFile, { kind: "character" | "character-lod" }>

function findNode(document: Document, name: string) {
  return document
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name)
}

/**
 * Checks a robot (or its LOD) against its contract entry: one skin with exactly the contract's
 * joints, the props that rest hidden at scale 0, the mesh nodes, the face's morph targets in
 * contract order (scene code drives them by index), and the clips. The LOD's joints and morph
 * targets may be "same as robot.glb".
 */
export function checkCharacter(
  report: ContractReport,
  spec: CharacterSpec,
  robotSpec: CharacterFile,
  document: Document,
): void {
  const root = document.getRoot()
  const joints = spec.joints === "same as robot.glb" ? robotSpec.joints : spec.joints
  const skins = root.listSkins()
  const [skin] = skins
  if (skins.length !== 1 || !skin) report.fail(`expected 1 skin, found ${skins.length}`)
  else {
    report.sameSet(
      "skin joints",
      joints,
      skin.listJoints().map((joint) => joint.getName()),
    )
  }
  for (const jointName of spec.hiddenAtRest) {
    const scale = findNode(document, jointName)?.getScale()
    if (!scale) report.fail(`hiddenAtRest joint ${jointName} not found`)
    else if (scale.some((value) => value !== 0)) {
      report.fail(`joint ${jointName} should rest at scale 0, is [${scale}]`)
    }
  }
  report.sameSet(
    "mesh nodes",
    spec.meshes,
    root
      .listNodes()
      .filter((node) => node.getMesh())
      .map((node) => node.getName()),
  )
  const morphTargets =
    spec.morphTargets === "same as robot.glb" ? robotSpec.morphTargets : spec.morphTargets
  const face = findNode(document, morphTargets.mesh)?.getMesh()
  if (face) {
    const targetNames = MeshExtrasSchema.safeParse(face.getExtras()).data?.targetNames ?? []
    if (JSON.stringify(targetNames) !== JSON.stringify(morphTargets.names)) {
      report.fail(`${morphTargets.mesh} morph target names/order differ: [${targetNames}]`)
    }
    for (const primitive of face.listPrimitives()) {
      const primitiveTargets = primitive.listTargets().map((target) => target.getName())
      if (JSON.stringify(primitiveTargets) !== JSON.stringify(morphTargets.names)) {
        report.fail(
          `${morphTargets.mesh} morph targets differ from contract: [${primitiveTargets}]`,
        )
      }
    }
  }
  report.sameSet(
    "clips",
    spec.clips,
    root.listAnimations().map((animation) => animation.getName()),
  )
}
