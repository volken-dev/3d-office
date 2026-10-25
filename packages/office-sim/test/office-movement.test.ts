import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { OfficeAgent } from "../src/agent"
import { agentStateNames } from "../src/agent-states"
import {
  type AssetContract,
  AssetContractSchema,
  contractMajorVersion,
  SUPPORTED_CONTRACT_MAJOR,
} from "../src/asset-contract"
import { type OfficeExtras, OfficeExtrasSchema, type OfficePoi } from "../src/office-extras"
import { createOfficeWorld, type OfficeWorld } from "../src/office-world"
import { findPath } from "../src/path-finding"
import { poiKind } from "../src/poi-slots"
import { FakeActor } from "./support/fake-actor"
import { readClipDurations, readOfficeGlb } from "./support/office-glb"

/** The shipped office, robot and contract, as committed in packages/scene (built by packages/office-assets). */
const SCENE_ASSETS = path.resolve(import.meta.dir, "../../scene/assets")

const FRAME = 1 / 30
const SETTLE_BUDGET_SECONDS = 90
const AGENT_COUNT = 5

/** A fake actor that knows the real robot's clip lengths and refuses clips the robot lacks. */
class RobotActor extends FakeActor {
  constructor(private readonly durations: ReadonlyMap<string, number>) {
    super()
  }

  override duration(clip: string): number {
    return this.durations.get(clip) ?? 0
  }
}

let extras: OfficeExtras
let pois: OfficePoi[]
let contract: AssetContract
let clipDurations: Map<string, number>

beforeAll(() => {
  const office = readOfficeGlb(`${SCENE_ASSETS}/models/office.glb`)
  extras = OfficeExtrasSchema.parse(office.extras)
  pois = office.pois
  const contractJson: unknown = JSON.parse(
    readFileSync(`${SCENE_ASSETS}/asset-contract.json`, "utf8"),
  )
  contract = AssetContractSchema.parse(contractJson)
  clipDurations = readClipDurations(`${SCENE_ASSETS}/models/robot.glb`)
})

function spawnAgents(world: OfficeWorld): { agent: OfficeAgent; actor: RobotActor }[] {
  return Array.from({ length: AGENT_COUNT }, (_, agentIndex) => {
    const actor = new RobotActor(clipDurations)
    const agent = new OfficeAgent({ id: agentIndex + 1, desk: agentIndex + 1, actor, world })
    const [x, z] = world.approachOf(`poi-idle-spawn-${agentIndex + 1}`)
    agent.spawnAt(x, z)
    return { agent, actor }
  })
}

/**
 * Gives each agent its state, then steps everyone until all settle. Fails on two agents holding one
 * POI in any frame, on running past the budget, or on an agent ending anywhere but on a POI of its
 * state playing that state's clip. Returns the simulated seconds taken.
 */
function driveToStates(
  world: OfficeWorld,
  agents: readonly { agent: OfficeAgent; actor: RobotActor }[],
  states: readonly string[],
  interruption?: { atSeconds: number; states: readonly string[] },
): number {
  for (const [agentIndex, { agent }] of agents.entries())
    agent.setState(states[agentIndex] ?? "idle")
  let wanted = states
  let elapsed = 0
  let interrupted = interruption === undefined
  while (elapsed < SETTLE_BUDGET_SECONDS) {
    if (interruption && !interrupted && elapsed >= interruption.atSeconds) {
      interrupted = true
      wanted = interruption.states
      for (const [agentIndex, { agent }] of agents.entries()) {
        agent.setState(wanted[agentIndex] ?? "idle")
      }
    }
    for (const { agent } of agents) agent.update(FRAME)
    elapsed += FRAME
    const held = agents.flatMap(({ agent }) => (agent.poi ? [agent.poi] : []))
    expect(new Set(held).size).toBe(held.length)
    if (interrupted && agents.every(({ agent }) => agent.settled)) break
  }
  agents.forEach(({ agent, actor }, agentIndex) => {
    const state = wanted[agentIndex] ?? "idle"
    expect(agent.settled).toBe(true)
    expect(agent.state).toBe(state)
    const poiName = agent.poi
    if (!poiName) throw new Error(`agent ${agent.id} holds no POI in ${state}`)
    const poi = world.poiNamed(poiName)
    expect(Math.hypot(agent.x - poi.x, agent.z - poi.z)).toBeLessThan(1e-3)
    const stateClips = (world.agentStates[state]?.slots ?? []).map((slot) => slot.clip)
    expect(stateClips).toContain(agent.clip ?? "")
    for (const clip of actor.clips) expect(clipDurations.has(clip)).toBe(true)
    const seatedClip = contract.poses.clips[agent.clip ?? ""] !== "stand"
    const seatedPoi = contract.poses.poiKinds[poiKind(poiName)] === "sit"
    expect(seatedClip).toBe(seatedPoi)
  })
  expect(world.taken.size).toBe(agents.length)
  return elapsed
}

describe("the real agent office", () => {
  test("its contract is the supported major and its extras parse", () => {
    expect(contractMajorVersion(contract.contractVersion)).toBe(SUPPORTED_CONTRACT_MAJOR)
    expect(extras.agents.max).toBeGreaterThanOrEqual(AGENT_COUNT)
    expect(pois.length).toBeGreaterThan(0)
    expect(agentStateNames(extras)).toContain("working")
  })

  test("every POI's approach point has a path from spawn 1 and back, on walkable floor", () => {
    const world = createOfficeWorld({ extras, pois, contract })
    const spawn = world.approachOf("poi-idle-spawn-1")
    for (const poi of pois) {
      const approach = world.approachOf(poi.name)
      for (const [from, to] of [
        [spawn, approach],
        [approach, spawn],
      ] as const) {
        const path = findPath(world.grid, from, to)
        if (!path) throw new Error(`no path between spawn 1 and ${poi.name}`)
        for (let segment = 1; segment < path.length; segment++) {
          const start = path[segment - 1]
          const end = path[segment]
          if (!start || !end) throw new Error("missing waypoint")
          expect(world.grid.hasClearLine(start, end)).toBe(true)
        }
      }
    }
  })

  test("five agents walk from the door through every state in turn and settle apart", () => {
    const world = createOfficeWorld({ extras, pois, contract })
    const agents = spawnAgents(world)
    for (const state of agentStateNames(extras)) {
      const seconds = driveToStates(
        world,
        agents,
        agents.map(() => state),
      )
      expect(seconds).toBeLessThan(SETTLE_BUDGET_SECONDS)
    }
  })

  test("five agents in mixed states, re-targeted mid-walk, settle apart", () => {
    const world = createOfficeWorld({ extras, pois, contract })
    const agents = spawnAgents(world)
    const states = agentStateNames(extras)
    for (let offset = 0; offset < states.length; offset++) {
      driveToStates(
        world,
        agents,
        agents.map((_, agentIndex) => states[(agentIndex + offset) % states.length] ?? "idle"),
      )
    }
    driveToStates(
      world,
      agents,
      agents.map((_, agentIndex) => states[agentIndex % states.length] ?? "idle"),
      {
        atSeconds: 1.2,
        states: agents.map((_, agentIndex) => states[(agentIndex + 3) % states.length] ?? "idle"),
      },
    )
  })
})
