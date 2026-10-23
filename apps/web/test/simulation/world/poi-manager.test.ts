import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { getAllAgents } from "@the-delegation/agents/team"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { type GLTF, GLTFLoader, type GLTFLoaderPlugin } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"
import { AGENTIC_SETS } from "../../../src/data/agents"
import { NavMeshManager } from "../../../src/simulation/pathfinding/NavMeshManager"
import { PoiManager } from "../../../src/simulation/world/PoiManager"
import { BOARDROOM_POI_ID, deskPoiId, spawnPoiId } from "../../../src/simulation/world/poiIds"
import { isNavMeshName } from "../../../src/simulation/world/WorldManager"

const OFFICE_GLB = path.resolve(import.meta.dir, "../../../public/models/office.glb")

/** There is no image decoder in bun, so textures load as blanks; the contract is in the nodes. */
const blankTextures: GLTFLoaderPlugin = {
  name: "test_blank_textures",
  loadTexture: () => Promise.resolve(new THREE.Texture()),
}

async function loadOffice(): Promise<GLTF> {
  const file = readFileSync(OFFICE_GLB)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => blankTextures)
  return loader.parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  )
}

function poiNode(name: string, userData: Record<string, unknown>): THREE.Object3D {
  const node = new THREE.Object3D()
  node.name = name
  node.userData = userData
  return node
}

function loadPois(...nodes: THREE.Object3D[]): PoiManager {
  const scene = new THREE.Group()
  scene.add(...nodes)
  const poiManager = new PoiManager()
  poiManager.loadFromGlb(scene)
  return poiManager
}

describe("PoiManager.loadFromGlb", () => {
  test("reads each kind from the node extras and ids it with the poiIds helpers", () => {
    const poiManager = loadPois(
      poiNode("anything", { name: "anything", poi: "desk", slot: 3 }),
      poiNode("spawn", { poi: "spawn", slot: 1 }),
      poiNode("seat", { poi: "seat", slot: 2 }),
      poiNode("boardroom", { poi: "area", area: "boardroom" }),
    )
    expect(poiManager.getPoi(deskPoiId(3))).toMatchObject({
      kind: "desk",
      arrivalState: "sit_work",
    })
    expect(poiManager.getPoi(spawnPoiId(1))).toMatchObject({ kind: "spawn", arrivalState: "idle" })
    expect(poiManager.getPoi(BOARDROOM_POI_ID)).toMatchObject({
      kind: "area",
      arrivalState: "idle",
    })
    expect(poiManager.getPoisOfKind("seat")).toEqual([
      expect.objectContaining({ id: "seat-2", arrivalState: "sit_idle", label: "Sit down" }),
    ])
  })

  test("ignores nodes without a poi extra, whatever they are named", () => {
    const poiManager = loadPois(poiNode("poi-sit_work-1", { name: "poi-sit_work-1" }))
    expect([...poiManager.values()]).toEqual([])
  })

  test("throws, naming the node, on extras that do not match the schema", () => {
    expect(() => loadPois(poiNode("desk-a", { poi: "desk", slot: "a" }))).toThrow(/"desk-a"/)
    expect(() => loadPois(poiNode("bench", { poi: "bench", slot: 1 }))).toThrow(/"bench"/)
    expect(() => loadPois(poiNode("area", { poi: "area", area: "Board Room" }))).toThrow(/"area"/)
  })

  test("throws on two nodes with the same POI", () => {
    expect(() =>
      loadPois(
        poiNode("first", { poi: "seat", slot: 1 }),
        poiNode("second", { poi: "seat", slot: 1 }),
      ),
    ).toThrow(/Duplicate POI "seat-1"/)
  })

  test("orders POIs of a kind by slot number, not by text", () => {
    const poiManager = loadPois(
      poiNode("ten", { poi: "spawn", slot: 10 }),
      poiNode("two", { poi: "spawn", slot: 2 }),
    )
    expect(poiManager.getPoisOfKind("spawn").map((poi) => poi.id)).toEqual(["spawn-2", "spawn-10"])
  })
})

/**
 * The contract between public/models/office.glb and the code: every POI the scene looks up and the
 * navmesh exist, and agents can reach each POI. Rename or drop one in the asset and this fails.
 */
describe("office.glb contract", () => {
  const poiManager = new PoiManager()
  const navMesh = new NavMeshManager()
  let navMeshCount = 0

  beforeAll(async () => {
    const office = await loadOffice()
    poiManager.loadFromGlb(office.scene)
    office.scene.traverse((node) => {
      if (node instanceof THREE.Mesh && isNavMeshName(node.name)) {
        navMesh.loadFromGeometry(node.geometry)
        navMeshCount++
      }
    })
  })

  test("has exactly one navmesh", () => {
    expect(navMeshCount).toBe(1)
  })

  const agentIndices = [
    ...new Set(AGENTIC_SETS.flatMap((system) => getAllAgents(system).map((agent) => agent.index))),
  ].sort((a, b) => a - b)

  const requiredPoiIds = [
    BOARDROOM_POI_ID,
    ...agentIndices.flatMap((agentIndex) => [spawnPoiId(agentIndex), deskPoiId(agentIndex)]),
  ]

  for (const poiId of requiredPoiIds) {
    test(`has ${poiId}, on the navmesh`, () => {
      const poi = poiManager.getPoi(poiId)
      expect(poi).toBeDefined()
      if (poi) expect(navMesh.isPointOnNavMesh(poi.position)).toBe(true)
    })
  }

  test("has seats and areas for idle agents, on the navmesh", () => {
    for (const kind of ["seat", "area"] as const) {
      const pois = poiManager.getPoisOfKind(kind)
      expect(pois.length).toBeGreaterThan(0)
      for (const poi of pois) expect(navMesh.isPointOnNavMesh(poi.position)).toBe(true)
    }
  })
})
