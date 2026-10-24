import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { type GLTF, GLTFLoader, type GLTFLoaderPlugin } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"
import { z } from "zod"

const ASSETS_DIR = path.resolve(import.meta.dir, "../../assets")

/** The parts of the contract's `files` section these checks compare the shipped models with. */
const ContractFilesSchema = z.object({
  agents: z.object({ max: z.number().int().positive() }),
  files: z.object({
    "robot.glb": z.object({
      joints: z.array(z.string()),
      hiddenAtRest: z.array(z.string()),
      meshes: z.array(z.string()),
      morphTargets: z.object({ mesh: z.string(), names: z.array(z.string()) }),
      materials: z.array(z.string()),
      clips: z.array(z.string()),
    }),
    "office.glb": z.object({
      nodes: z.array(z.string()),
      clips: z.array(z.string()),
      pois: z.record(z.string(), z.union([z.string(), z.array(z.union([z.number(), z.string()]))])),
      nightLights: z.array(z.string()),
      materials: z.array(z.string()),
      sceneExtras: z.array(z.string()),
    }),
  }),
})

const contract = ContractFilesSchema.parse(
  JSON.parse(readFileSync(path.join(ASSETS_DIR, "asset-contract.json"), "utf8")),
)

/** There is no image decoder in bun, so textures load as blanks; the contract is in the nodes. */
const blankTextures: GLTFLoaderPlugin = {
  name: "test_blank_textures",
  loadTexture: () => Promise.resolve(new THREE.Texture()),
}

async function loadModel(fileName: string): Promise<GLTF> {
  const file = readFileSync(path.join(ASSETS_DIR, "models", fileName))
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => blankTextures)
  return loader.parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  )
}

/** GLTFLoader strips characters animation paths reserve from node names, so `leg.L` loads as `legL`. */
function loadedNodeName(name: string): string {
  return THREE.PropertyBinding.sanitizeNodeName(name)
}

function materialNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>()
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material]
    for (const material of materials) names.add(material.name)
  })
  return names
}

function nodeNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>()
  root.traverse((node) => {
    names.add(node.name)
  })
  return names
}

/** The POI ids the contract lists for a kind: a range up to agents.max, or an explicit list. */
function expectedPoiIds(rule: string | readonly (number | string)[], max: number): string[] {
  if (Array.isArray(rule)) return rule.map(String)
  if (rule === "1..agents.max") return Array.from({ length: max }, (_, slot) => String(slot + 1))
  return []
}

describe("robot.glb matches the asset contract", () => {
  const robotContract = contract.files["robot.glb"]
  let robot: GLTF

  beforeAll(async () => {
    robot = await loadModel("robot.glb")
  })

  test("has every contract joint, resting props at scale 0", () => {
    const names = nodeNames(robot.scene)
    for (const joint of robotContract.joints) expect(names.has(loadedNodeName(joint))).toBe(true)
    for (const prop of robotContract.hiddenAtRest) {
      const node = robot.scene.getObjectByName(loadedNodeName(prop))
      expect(node?.scale.length()).toBe(0)
    }
  })

  test("has every contract clip", () => {
    const clips = new Set(robot.animations.map((clip) => clip.name))
    for (const clip of robotContract.clips) expect(clips.has(clip)).toBe(true)
  })

  test("the face carries the contract morph targets in order", () => {
    const face = robot.scene.getObjectByName(robotContract.morphTargets.mesh)
    const faceMesh = face instanceof THREE.Mesh ? face : face?.children.find(isMesh)
    if (!(faceMesh instanceof THREE.Mesh)) throw new Error("no face mesh")
    const dictionary = faceMesh.morphTargetDictionary ?? {}
    robotContract.morphTargets.names.forEach((name, order) => {
      expect(dictionary[name]).toBe(order)
    })
  })

  test("uses the contract's material names", () => {
    const names = materialNames(robot.scene)
    for (const material of robotContract.materials) expect(names.has(material)).toBe(true)
  })
})

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return node instanceof THREE.Mesh
}

describe("office.glb matches the asset contract", () => {
  const officeContract = contract.files["office.glb"]
  let office: GLTF

  beforeAll(async () => {
    office = await loadModel("office.glb")
  })

  test("has every contract node, night light and clip", () => {
    const names = nodeNames(office.scene)
    for (const node of officeContract.nodes) expect(names.has(node)).toBe(true)
    for (const light of officeContract.nightLights)
      expect(names.has(`night-light-${light}`)).toBe(true)
    const clips = new Set(office.animations.map((clip) => clip.name))
    for (const clip of officeContract.clips) expect(clips.has(clip)).toBe(true)
  })

  test("has every contract POI, named poi-<kind>-<id>", () => {
    const names = nodeNames(office.scene)
    for (const [kind, rule] of Object.entries(officeContract.pois)) {
      if (kind === "stand-*") continue
      for (const id of expectedPoiIds(rule, contract.agents.max)) {
        expect(names.has(`poi-${kind}-${id}`)).toBe(true)
      }
    }
  })

  test("uses the contract's material names and carries its scene extras", () => {
    const names = materialNames(office.scene)
    for (const material of officeContract.materials) expect(names.has(material)).toBe(true)
    const extras: Record<string, unknown> = office.scene.userData
    for (const key of officeContract.sceneExtras) expect(extras[key]).toBeDefined()
  })
})
