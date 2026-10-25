import type { Document } from "@gltf-transform/core"
import { checkCharacter } from "./check-character.ts"
import { checkCommon } from "./check-common.ts"
import { checkOfficeScene } from "./check-office-scene.ts"
import { ContractReport } from "./contract-report.ts"
import type { CharacterFile, CheckedContract, ContractFile } from "./contract-schema.ts"

/** A shipped model as read for checking: its document and its size on disk. */
export type LoadedModel = { document: Document; bytes: number }

function robotSpecOf(contract: CheckedContract): CharacterFile {
  const robot = contract.files["robot.glb"]
  if (robot?.kind !== "character") throw new Error('the contract must list "robot.glb"')
  return robot
}

function clipNames(document: Document): string[] {
  return document
    .getRoot()
    .listAnimations()
    .map((animation) => animation.getName())
}

/** Every clip has a pose, and every transition clip is one of the robot's clips. */
function checkContractConsistency(report: ContractReport, contract: CheckedContract): void {
  report.file = "asset-contract.json"
  const robotSpec = robotSpecOf(contract)
  for (const clip of robotSpec.clips) {
    if (!Object.hasOwn(contract.poses.clips, clip))
      report.fail(`clip ${clip} has no pose in poses.clips`)
  }
  const sequences = Object.values({
    ...contract.transitions.byPoiPose,
    ...contract.transitions.byPoiKind,
  })
  const transitionClips = [
    ...contract.transitions.oneShotClips,
    ...sequences.flatMap((sequence) => [...(sequence.enter ?? []), ...(sequence.exit ?? [])]),
  ]
  for (const clip of transitionClips) {
    if (!robotSpec.clips.includes(clip))
      report.fail(`transition clip ${clip} not in robot.glb clips`)
  }
}

/** The LOD names the clip source, uses only its parent's materials, and has every clip target. */
function checkLodLinks(
  report: ContractReport,
  spec: Extract<ContractFile, { kind: "character-lod" }>,
  contract: CheckedContract,
  model: LoadedModel,
  models: ReadonlyMap<string, LoadedModel>,
): void {
  const animationsFrom = model.document.getRoot().getDefaultScene()?.getExtras().animationsFrom
  if (animationsFrom !== spec.animationsFrom) {
    report.fail(
      `scene extras animationsFrom should be "${spec.animationsFrom}", is ${JSON.stringify(animationsFrom)}`,
    )
  }
  const parentMaterials = contract.files[spec.lodOf]?.materials ?? []
  const extraMaterials = spec.materials.filter((material) => !parentMaterials.includes(material))
  if (extraMaterials.length) {
    report.fail(`LOD materials not in ${spec.lodOf}: ${report.list(extraMaterials)}`)
  }
  const clipSource = models.get(spec.animationsFrom)
  if (!clipSource) return
  const ownNodeNames = new Set(
    model.document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
  )
  const missingTargets = new Set<string>()
  for (const animation of clipSource.document.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const targetName = channel.getTargetNode()?.getName() ?? ""
      if (!ownNodeNames.has(targetName)) missingTargets.add(targetName)
    }
  }
  if (missingTargets.size) {
    report.fail(
      `${spec.animationsFrom} clips target nodes missing here: ${report.list(missingTargets)}`,
    )
  }
}

/** The minibot's named nodes rest visible (scale 1), with the robot's material names and its clips. */
function checkCompanion(
  report: ContractReport,
  spec: Extract<ContractFile, { kind: "companion" }>,
  document: Document,
  materialNames: readonly string[],
): void {
  for (const nodeName of spec.nodes) {
    const node = document
      .getRoot()
      .listNodes()
      .find((candidate) => candidate.getName() === nodeName)
    if (!node) report.fail(`node ${nodeName} missing`)
    else if (node.getScale().some((value) => value !== 1)) {
      report.fail(`node ${nodeName} should rest at scale 1`)
    }
  }
  report.sameSet("materials", spec.materials, materialNames)
  report.sameSet("clips", spec.clips, clipNames(document))
}

/**
 * Checks shipped models against the asset contract: everything the scene and the movement code
 * may rely on. Files in `required` must be present; any other contract file is checked when it is
 * given. Returns every break found, not just the first, plus a summary line per file.
 */
export function checkContract(
  contract: CheckedContract,
  models: ReadonlyMap<string, LoadedModel>,
  required: readonly string[],
): ContractReport {
  const report = new ContractReport()
  checkContractConsistency(report, contract)
  const robotSpec = robotSpecOf(contract)
  const robotModel = models.get("robot.glb")
  for (const [name, spec] of Object.entries(contract.files)) {
    report.file = name
    const model = models.get(name)
    if (!model) {
      if (required.includes(name)) report.fail("missing")
      continue
    }
    const errorsBefore = report.errors.length
    const cost = checkCommon(
      report,
      spec,
      model.document,
      model.bytes,
      contract.loading.allowedExtensions,
    )
    if (spec.kind === "character" || spec.kind === "character-lod") {
      checkCharacter(report, spec, robotSpec, model.document)
      report.sameSet("materials", spec.materials, cost.materialNames)
    }
    if (spec.kind === "character-lod") checkLodLinks(report, spec, contract, model, models)
    if (spec.kind === "scene") {
      const robotClips = robotModel ? clipNames(robotModel.document) : robotSpec.clips
      checkOfficeScene(report, contract, spec, model.document, cost.materialNames, robotClips)
    }
    if (spec.kind === "companion") {
      checkCompanion(report, spec, model.document, cost.materialNames)
    }
    report.summaries.push({
      name,
      passed: report.errors.length === errorsBefore,
      bytes: model.bytes,
      triangles: cost.triangles,
      drawCalls: cost.drawCalls,
    })
  }
  return report
}
