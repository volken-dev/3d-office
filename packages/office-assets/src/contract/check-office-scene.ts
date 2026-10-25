import type { Document, Node } from "@gltf-transform/core"
import { type OfficeExtras, OfficeExtrasSchema } from "@the-delegation/office-sim/office-extras"
import { z } from "zod"
import { checkOfficePois } from "./check-office-pois.ts"
import type { ContractReport } from "./contract-report.ts"
import type { CheckedContract, SceneFile } from "./contract-schema.ts"

const AtlasesSchema = z.looseObject({
  screenAtlas: z.record(z.string(), z.unknown()).optional(),
  artAtlas: z.record(z.string(), z.unknown()).optional(),
})

const AtlasRectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

function nodeNamed(nodes: readonly Node[], name: string): Node | undefined {
  return nodes.find((node) => node.getName() === name)
}

function checkNodesAndMaterials(
  report: ContractReport,
  spec: SceneFile,
  nodes: readonly Node[],
  materialNames: readonly string[],
): void {
  const names = nodes.map((node) => node.getName())
  for (const name of spec.nodes) {
    if (!nodeNamed(nodes, name)?.getMesh()) report.fail(`node ${name} missing or has no mesh`)
  }
  report.sameSet(
    "static-<zone> nodes",
    spec.zones.map((zone) => `static-${zone}`),
    names.filter((name) => name.startsWith("static-") && !spec.nodes.includes(name)),
  )
  const prefixes = Object.keys(spec.nodePrefixes)
  const outsideNames = names.filter(
    (name) =>
      name && !spec.nodes.includes(name) && !prefixes.some((prefix) => name.startsWith(prefix)),
  )
  if (outsideNames.length) {
    report.fail(
      `top-level names outside the contract's nodes/prefixes: ${report.list(outsideNames)}`,
    )
  }
  const missingMaterials = spec.materials.filter((material) => !materialNames.includes(material))
  if (missingMaterials.length) report.fail(`materials missing: ${report.list(missingMaterials)}`)
  if (materialNames.some((material) => /^owner_/.test(material))) {
    report.fail("owner_* materials are gone in contract 4.x (status_glow + status_colors)")
  }
}

/** The Ambient clip plays `anim-*` nodes only, and every `anim-*` node is animated. */
function checkAmbientClip(report: ContractReport, spec: SceneFile, document: Document): void {
  const root = document.getRoot()
  report.sameSet(
    "clips",
    spec.clips,
    root.listAnimations().map((animation) => animation.getName()),
  )
  const animatedNames = new Set(
    root
      .listAnimations()
      .flatMap((animation) =>
        animation.listChannels().map((channel) => channel.getTargetNode()?.getName() ?? ""),
      ),
  )
  const strayTargets = [...animatedNames].filter((name) => !name.startsWith("anim-"))
  if (strayTargets.length) {
    report.fail(`Ambient animates non anim-* nodes: ${report.list(strayTargets)}`)
  }
  const stillNodes = root
    .listNodes()
    .map((node) => node.getName())
    .filter((name) => name.startsWith("anim-") && !animatedNames.has(name))
  if (stillNodes.length) report.fail(`anim-* nodes nobody animates: ${report.list(stillNodes)}`)
}

/**
 * One status texel per pod and bay, the contract's colours, and status materials that take their
 * colour from the status texture (the scene swaps in a DataTexture there).
 */
function checkStatusColors(
  report: ContractReport,
  contract: CheckedContract,
  extras: OfficeExtras,
  document: Document,
): void {
  const root = document.getRoot()
  const agentsMax = contract.agents.max
  const statusColors = extras.statusColors
  if (statusColors.desks !== agentsMax) {
    report.fail(`statusColors.desks is ${statusColors.desks}, expected agents.max ${agentsMax}`)
  }
  const texture = root
    .listTextures()
    .find((candidate) => candidate.getName() === statusColors.texture)
  if (!texture) report.fail(`statusColors texture ${statusColors.texture} not found`)
  else {
    const [width, height] = texture.getSize() ?? []
    if (width !== statusColors.width || height !== 1 || (width ?? 0) < agentsMax) {
      report.fail(
        `status texture is ${width}x${height}, expected ${statusColors.width}x1 with >= ${agentsMax} texels`,
      )
    }
  }
  for (const materialName of statusColors.materials) {
    const material = root.listMaterials().find((candidate) => candidate.getName() === materialName)
    if (!material || material.getBaseColorTexture() !== texture) {
      report.fail(`material ${materialName} should take its colour from ${statusColors.texture}`)
    }
  }
  if (JSON.stringify(statusColors.colors) !== JSON.stringify(contract.statusColors.colors)) {
    report.fail(
      `statusColors.colors ${JSON.stringify(statusColors.colors)} differ from the contract's ${JSON.stringify(contract.statusColors.colors)}`,
    )
  }
}

function checkNightLights(report: ContractReport, spec: SceneFile, nodes: readonly Node[]): void {
  const lights = nodes.filter((node) => node.getName().startsWith("night-light-"))
  report.sameSet(
    "night lights",
    spec.nightLights,
    lights.map((node) => node.getName().slice("night-light-".length)),
  )
  for (const light of lights) {
    if (!light.getExtension("KHR_lights_punctual")) {
      report.fail(`${light.getName()} has no KHR_lights_punctual light`)
    }
  }
}

function checkAtlases(report: ContractReport, sceneExtras: unknown): void {
  const atlases = AtlasesSchema.safeParse(sceneExtras).data
  const rects = { ...atlases?.screenAtlas, ...atlases?.artAtlas }
  for (const [name, rect] of Object.entries(rects)) {
    const parsed = AtlasRectSchema.safeParse(rect)
    if (!parsed.success || parsed.data.some((value) => value < 0 || value > 1)) {
      report.fail(`screenAtlas/artAtlas ${name} is not [u0,v0,u1,v1] in 0..1`)
    }
  }
}

/**
 * Checks the office against its contract entry: named nodes and zones, node prefixes, materials,
 * the Ambient clip, the scene extras (parsed with the same schema the scene uses), status colours,
 * POIs and their approach points on the walk grid, night lights, atlases and agent states.
 */
export function checkOfficeScene(
  report: ContractReport,
  contract: CheckedContract,
  spec: SceneFile,
  document: Document,
  materialNames: readonly string[],
  robotClipNames: readonly string[],
): void {
  const root = document.getRoot()
  const nodes = root.listNodes()
  checkNodesAndMaterials(report, spec, nodes, materialNames)
  const sceneExtras = root.getDefaultScene()?.getExtras() ?? {}
  for (const key of spec.sceneExtras) {
    if (!Object.hasOwn(sceneExtras, key)) report.fail(`scene extras missing ${key}`)
  }
  checkAmbientClip(report, spec, document)
  checkNightLights(report, spec, nodes)
  checkAtlases(report, sceneExtras)
  const parsedExtras = OfficeExtrasSchema.safeParse(sceneExtras)
  if (!parsedExtras.success) {
    report.fail(`scene extras do not parse: ${parsedExtras.error.message}`)
    return
  }
  const extras = parsedExtras.data
  if (extras.agents.max !== contract.agents.max) {
    report.fail(
      `scene extras agents.max is ${extras.agents.max}, contract says ${contract.agents.max}`,
    )
  }
  checkStatusColors(report, contract, extras, document)
  checkOfficePois(report, contract, spec, extras, nodes, robotClipNames)
}
