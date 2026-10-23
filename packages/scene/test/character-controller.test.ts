import { describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import { CharacterController } from "../src/character-controller"
import { DEFAULT_CHARACTER_MODEL_ID, findCharacterModel } from "../src/characters/character-models"
import { CharacterManager, type LoadedCharacterModel } from "../src/entities/character-manager"
import { NavMeshManager } from "../src/pathfinding/nav-mesh-manager"
import { nonPlayerMembers, type SceneCast, userIndexOf } from "../src/scene-cast"
import { AgentBehavior } from "../src/scene-types"
import { PoiManager } from "../src/world/poi-manager"
import { castOf } from "./support/cast"

/** A one-bone skinned box with an idle clip: enough for CharacterManager to bake a rig headless. */
function fakeHumanModel(): LoadedCharacterModel {
  const model = findCharacterModel(DEFAULT_CHARACTER_MODEL_ID)
  if (!model) throw new Error("default character model is not registered")
  const head = new THREE.Bone()
  head.name = "Head"
  const geometry = new THREE.BoxGeometry()
  const vertexCount = geometry.attributes.position.count
  const skinWeights = new Float32Array(vertexCount * 4)
  for (let vertex = 0; vertex < vertexCount; vertex++) skinWeights[vertex * 4] = 1
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(vertexCount * 4, 4))
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeights, 4))
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
  const scene = new THREE.Group()
  scene.add(head, mesh)
  mesh.bind(new THREE.Skeleton([head]))
  const idle = new THREE.AnimationClip("idle", 1, [
    new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 0, 0, 0]),
  ])
  return { model, gltf: { scene, animations: [idle] } }
}

/** Office stand-in with one spawn POI per agent, so warps land on known positions. */
function officeWithSpawns(spawnCount: number): PoiManager {
  const office = new THREE.Group()
  for (let spawn = 0; spawn < spawnCount; spawn++) {
    const marker = new THREE.Object3D()
    marker.name = `spawn ${spawn}`
    marker.userData = { poi: "spawn", slot: spawn }
    marker.position.set(spawn * 2 + 2, 0, 0)
    office.add(marker)
  }
  office.updateMatrixWorld(true)
  const poiManager = new PoiManager()
  poiManager.loadFromGlb(office)
  return poiManager
}

function sceneFor(initialCast: SceneCast) {
  const poiManager = officeWithSpawns(5)
  const characterManager = new CharacterManager(new THREE.Scene(), initialCast)
  characterManager.setPoiManager(poiManager)
  characterManager.setup([fakeHumanModel()])
  const controller = new CharacterController(
    characterManager,
    new NavMeshManager(),
    poiManager,
    userIndexOf(initialCast),
  )
  return { controller, characterManager }
}

/** What SceneManager.rebuildForCast does with the controller. */
function rebuild(controller: CharacterController, nextCast: SceneCast) {
  controller.setCast(nextCast)
  controller.warpAllToSpawn(
    userIndexOf(nextCast),
    nonPlayerMembers(nextCast).map((member) => member.index),
  )
}

const position = new THREE.Vector3()

describe("CharacterController rebuild", () => {
  test("removing a middle agent rebuilds without an out-of-range index", () => {
    const { controller } = sceneFor(castOf(0, [1, 2, 3, 4]))
    const withoutThree = castOf(0, [1, 2, 4])

    expect(() => rebuild(controller, withoutThree)).not.toThrow()
    expect(controller.getAgentIndices()).toEqual([0, 1, 2, 4])
    expect(controller.getCPUPosition(3, position)).toBe(false)
    expect(controller.getCPUPosition(4, position)).toBe(true)
    expect(position.x).toBe(6)
    expect(controller.getState(4)).toBe("idle")
  })

  test("characters keep their own data when indices have gaps and the user is not 0", () => {
    const { controller } = sceneFor(castOf(0, [1, 2]))
    const sparse = castOf(5, [7, 3, 9])
    rebuild(controller, sparse)

    controller.characterManager.setPosition(9, new THREE.Vector3(-4, 0, 1))
    controller.setPhysicsMode(9, AgentBehavior.SEATED)

    expect(controller.getCPUPosition(9, position)).toBe(true)
    expect(position.toArray()).toEqual([-4, 0, 1])
    expect(controller.getAgentState(9)).toBe(AgentBehavior.SEATED)
    expect(controller.getAgentState(3)).toBe(AgentBehavior.IDLE)
    expect(controller.getCPUPosition(5, position)).toBe(true)
    expect(position.toArray()).toEqual([0, 0, 0])
  })

  test("an agent that is no longer on the roster is ignored, not a crash", () => {
    const { controller } = sceneFor(castOf(0, [1, 2, 3]))
    rebuild(controller, castOf(0, [1, 3]))

    expect(() => {
      controller.cancelMovement(2)
      controller.play(2, "walk")
      controller.setSpeaking(2, true)
    }).not.toThrow()
    expect(controller.moveTo(2, new THREE.Vector3(1, 0, 1))).toBe(false)
    expect(controller.getCPUPosition(2, position)).toBe(false)
  })

  test("adding an agent back after a removal gives it a character", () => {
    const { controller } = sceneFor(castOf(0, [1, 2, 3]))
    rebuild(controller, castOf(0, [1, 3]))
    rebuild(controller, castOf(0, [1, 3, 4]))

    expect(controller.getAgentIndices()).toEqual([0, 1, 3, 4])
    expect(controller.getCPUPosition(4, position)).toBe(true)
    expect(position.x).toBe(6)
  })
})

describe("CharacterController seats", () => {
  test("a removed agent's spawn is free for the rest of the team", () => {
    const { controller } = sceneFor(castOf(0, [1, 2, 3]))
    rebuild(controller, castOf(0, [1, 3]))

    const occupants = controller.poiManager.getPoisOfKind("spawn").map((poi) => poi.occupiedBy)
    expect(occupants).toEqual([1, 3, null, null, null])
  })
})
