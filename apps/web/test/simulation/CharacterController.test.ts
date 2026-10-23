import { describe, expect, test } from "bun:test"
import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import * as THREE from "three/webgpu"
import { CharacterController } from "../../src/simulation/CharacterController"
import {
  DEFAULT_CHARACTER_MODEL_ID,
  findCharacterModel,
} from "../../src/simulation/characters/characterModels"
import {
  CharacterManager,
  type LoadedCharacterModel,
} from "../../src/simulation/entities/CharacterManager"
import { NavMeshManager } from "../../src/simulation/pathfinding/NavMeshManager"
import { PoiManager } from "../../src/simulation/world/PoiManager"
import { AgentBehavior } from "../../src/types"

function agent(index: number, subagents?: AgentNode[]): AgentNode {
  return {
    id: `agent-${index}`,
    index,
    name: `Agent ${index}`,
    description: "",
    color: "#336699",
    model: "m",
    subagents,
  }
}

function team(userIndex: number, lead: AgentNode): AgenticSystem {
  return {
    id: "team",
    teamName: "Team",
    teamType: "",
    teamDescription: "",
    color: "#000000",
    user: { index: userIndex, model: "Human" },
    leadAgent: lead,
  }
}

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
    marker.name = `poi-spawn-${spawn}`
    marker.position.set(spawn * 2 + 2, 0, 0)
    office.add(marker)
  }
  office.updateMatrixWorld(true)
  const poiManager = new PoiManager()
  poiManager.loadFromGlb(office)
  return poiManager
}

function sceneFor(initialTeam: AgenticSystem) {
  const poiManager = officeWithSpawns(5)
  const characterManager = new CharacterManager(new THREE.Scene(), initialTeam)
  characterManager.setPoiManager(poiManager)
  characterManager.setup([fakeHumanModel()])
  const controller = new CharacterController(
    characterManager,
    new NavMeshManager(),
    poiManager,
    initialTeam.user.index,
  )
  return { controller, characterManager }
}

/** What SceneManager.rebuildForTeam does with the controller. */
function rebuild(controller: CharacterController, nextTeam: AgenticSystem) {
  controller.setTeam(nextTeam)
  controller.warpAllToSpawn(nextTeam.user.index, [
    nextTeam.leadAgent.index,
    ...(nextTeam.leadAgent.subagents ?? []).map((subagent) => subagent.index),
  ])
}

const position = new THREE.Vector3()

describe("CharacterController rebuild", () => {
  test("removing a middle agent rebuilds without an out-of-range index", () => {
    const { controller } = sceneFor(team(0, agent(1, [agent(2), agent(3), agent(4)])))
    const withoutThree = team(0, agent(1, [agent(2), agent(4)]))

    expect(() => rebuild(controller, withoutThree)).not.toThrow()
    expect(controller.getAgentIndices()).toEqual([0, 1, 2, 4])
    expect(controller.getCPUPosition(3, position)).toBe(false)
    expect(controller.getCPUPosition(4, position)).toBe(true)
    expect(position.x).toBe(6)
    expect(controller.getState(4)).toBe("idle")
  })

  test("characters keep their own data when indices have gaps and the user is not 0", () => {
    const { controller } = sceneFor(team(0, agent(1, [agent(2)])))
    const sparse = team(5, agent(7, [agent(3), agent(9)]))
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
    const { controller } = sceneFor(team(0, agent(1, [agent(2), agent(3)])))
    rebuild(controller, team(0, agent(1, [agent(3)])))

    expect(() => {
      controller.cancelMovement(2)
      controller.play(2, "walk")
      controller.setSpeaking(2, true)
    }).not.toThrow()
    expect(controller.moveTo(2, new THREE.Vector3(1, 0, 1))).toBe(false)
    expect(controller.getCPUPosition(2, position)).toBe(false)
  })

  test("adding an agent back after a removal gives it a character", () => {
    const { controller } = sceneFor(team(0, agent(1, [agent(2), agent(3)])))
    rebuild(controller, team(0, agent(1, [agent(3)])))
    rebuild(controller, team(0, agent(1, [agent(3), agent(4)])))

    expect(controller.getAgentIndices()).toEqual([0, 1, 3, 4])
    expect(controller.getCPUPosition(4, position)).toBe(true)
    expect(position.x).toBe(6)
  })
})

describe("CharacterController seats", () => {
  test("a removed agent's spawn is free for the rest of the team", () => {
    const { controller } = sceneFor(team(0, agent(1, [agent(2), agent(3)])))
    rebuild(controller, team(0, agent(1, [agent(3)])))

    const occupants = controller.poiManager.getPoisByPrefix("spawn").map((poi) => poi.occupiedBy)
    expect(occupants).toEqual([1, 3, null, null, null])
  })
})
