import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { OfficeAgent } from "@the-delegation/office-sim/agent"
import { statusColorOf } from "@the-delegation/office-sim/agent-states"
import type { OfficeExtras } from "@the-delegation/office-sim/office-extras"
import type { OfficeWorld } from "@the-delegation/office-sim/office-world"
import type { GLTF } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"
import { prepareOfficeModel } from "../../src/office/office-model"
import { loadOfficeWorld } from "../../src/office/office-world-loader"
import { StatusLights } from "../../src/office/status-lights"
import { RobotRig } from "../../src/robots/robot-rig"
import { isMesh } from "../../src/scene-graph-guards"
import { loadModel } from "../support/load-model"

const FRAME = 1 / 30
const SETTLE_BUDGET_SECONDS = 90
const SLOTS = [1, 2, 3, 4, 5] as const

interface TestRobot {
  slot: number
  rig: RobotRig
  agent: OfficeAgent
}

let officeGltf: GLTF
let robotGltf: GLTF
let extras: OfficeExtras

beforeAll(async () => {
  ;[officeGltf, robotGltf] = await Promise.all([loadModel("office.glb"), loadModel("robot.glb")])
  extras = loadOfficeWorld(officeGltf.scene).extras
})

afterEach(() => {
  spyOn(console, "warn").mockRestore()
})

/** Five robots spawned the way the scene spawns them: slot N at spawn ((N - 1) mod 5) + 1, idling. */
function spawnRobots(world: OfficeWorld): TestRobot[] {
  return SLOTS.map((slot) => {
    const rig = new RobotRig({ scene: robotGltf.scene, animations: robotGltf.animations })
    const agent = new OfficeAgent({ id: slot, desk: slot, actor: rig.actor, world })
    const spawn = world.poiNamed(`poi-idle-spawn-${((slot - 1) % 5) + 1}`)
    agent.spawnAt(spawn.x, spawn.z, spawn.yaw)
    agent.update(0)
    return { slot, rig, agent }
  })
}

/** Steps every robot a frame at a time until all settle, failing if two ever hold one POI. */
function settle(
  robots: readonly TestRobot[],
  world: OfficeWorld,
  interruptAt?: () => void,
): number {
  let elapsed = 0
  let isInterrupted = interruptAt === undefined
  while (elapsed < SETTLE_BUDGET_SECONDS) {
    if (!isInterrupted && elapsed >= 1.2) {
      isInterrupted = true
      interruptAt?.()
    }
    for (const { agent, rig } of robots) {
      agent.update(FRAME)
      rig.update(FRAME)
    }
    elapsed += FRAME
    const held = robots.flatMap(({ agent }) => (agent.poi ? [agent.poi] : []))
    expect(new Set(held).size).toBe(held.length)
    if (isInterrupted && robots.every(({ agent }) => agent.settled)) break
  }
  for (const { agent } of robots) {
    expect(agent.settled).toBe(true)
    const poi = world.poiNamed(agent.poi ?? "")
    expect(Math.hypot(agent.x - poi.x, agent.z - poi.z)).toBeLessThan(1e-3)
  }
  return elapsed
}

function giveStates(robots: readonly TestRobot[], states: readonly string[]): void {
  robots.forEach(({ agent, rig }, robotIndex) => {
    const state = states[robotIndex] ?? "idle"
    agent.setState(state)
    rig.setStatusColor(statusColorOf(extras, state))
  })
}

function faceOf(rig: RobotRig): THREE.Mesh {
  const face = rig.root.getObjectByName("face")
  if (!face || !isMesh(face)) throw new Error("the robot has no face mesh")
  return face
}

describe("the real office and robots, without a renderer", () => {
  test("the office readies: navMesh hidden, glass casts no shadow, status lights attached", () => {
    const { world } = loadOfficeWorld(officeGltf.scene)
    prepareOfficeModel(officeGltf.scene)
    expect(officeGltf.scene.getObjectByName("navMesh")?.visible).toBe(false)
    const glass = officeGltf.scene.getObjectByName("static-glass")
    glass?.traverse((node) => {
      if (isMesh(node)) expect(node.castShadow).toBe(false)
    })
    const lights = new StatusLights(officeGltf.scene, extras.statusColors)
    expect(lights.slotCount).toBeGreaterThanOrEqual(extras.agents.max)
    expect(world.poiNames.length).toBeGreaterThan(50)
    lights.dispose()
  })

  test("five robots spawn by the door, walk to mixed states, re-target mid-walk and settle apart", () => {
    const warn = spyOn(console, "warn")
    const { world } = loadOfficeWorld(officeGltf.scene)
    const robots = spawnRobots(world)
    for (const { agent } of robots) {
      expect(agent.state).toBeNull()
      expect(agent.clip).toBe("Idle")
      expect(agent.poi).toBeNull()
    }
    giveStates(robots, ["working", "shipping", "idle", "paused_or_rate_limited", "error"])
    expect(settle(robots, world)).toBeLessThan(SETTLE_BUDGET_SECONDS)
    expect(robots[0]?.agent.poi).toBe("poi-sit_work-1")
    expect(robots[3]?.agent.poi).toBe("poi-charge-4")

    giveStates(robots, ["done", "waiting_for_input", "working", "arrive", "idle"])
    settle(robots, world, () =>
      giveStates(robots, ["shipping", "working", "error", "idle", "paused_or_rate_limited"]),
    )
    expect(robots.map(({ agent }) => agent.state)).toEqual([
      "shipping",
      "working",
      "error",
      "idle",
      "paused_or_rate_limited",
    ])
    expect(world.taken.size).toBe(robots.length)
    expect(warn).not.toHaveBeenCalled()
    for (const { rig } of robots) rig.dispose()
  }, 30_000)

  test("each robot owns its primary material, which eases to its status colour", () => {
    const { world } = loadOfficeWorld(officeGltf.scene)
    const [first, second] = spawnRobots(world)
    if (!first || !second) throw new Error("no robots")
    const primaryOf = (rig: RobotRig) => {
      const body = rig.root.getObjectByName("body_1")
      if (!body || !isMesh(body) || Array.isArray(body.material)) throw new Error("no body")
      return body.material
    }
    expect(primaryOf(first.rig)).not.toBe(primaryOf(second.rig))
    first.rig.setStatusColor("#e5484d")
    for (let frame = 0; frame < 60; frame++) first.rig.update(FRAME)
    const red = new THREE.Color("#e5484d")
    const material = primaryOf(first.rig)
    if (!(material instanceof THREE.MeshStandardMaterial)) throw new Error("not standard")
    expect(material.color.equals(red)).toBe(true)
    const secondMaterial = primaryOf(second.rig)
    if (!(secondMaterial instanceof THREE.MeshStandardMaterial)) throw new Error("not standard")
    expect(secondMaterial.color.equals(red)).toBe(false)
    first.rig.dispose()
    second.rig.dispose()
  })

  test("faces animate: the clips' morph tracks move the face's weights", () => {
    const { world } = loadOfficeWorld(officeGltf.scene)
    const [robot] = spawnRobots(world)
    if (!robot) throw new Error("no robot")
    robot.rig.actor.play("Sit_Work", { fade: 0 })
    const samples = new Set<string>()
    for (let frame = 0; frame < 60; frame++) {
      robot.rig.update(FRAME)
      samples.add(
        (faceOf(robot.rig).morphTargetInfluences ?? []).map((weight) => weight.toFixed(3)).join(),
      )
    }
    expect(samples.size).toBeGreaterThan(5)
    robot.rig.dispose()
  })
})
