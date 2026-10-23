import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { NavMesh } from "@recast-navigation/core"
import {
  MOVEMENT_STRIDE,
  type MovementBuffers,
  WALK_SPEED,
} from "../../../src/simulation/behavior/character-movement"
import {
  CHARACTER_RADIUS,
  CharacterCrowd,
} from "../../../src/simulation/pathfinding/character-crowd"
import { NavMeshManager } from "../../../src/simulation/pathfinding/nav-mesh-manager"
import { loadNavigationRuntime } from "../../../src/simulation/pathfinding/navigation-runtime"
import { buildFloorGeometry } from "../../support/floor-geometry"

const FRAME = 1 / 60
const MAX_FRAMES = 60 * 20

const navMeshManager = new NavMeshManager()
let navMesh: NavMesh

beforeAll(async () => {
  await loadNavigationRuntime()
  navMeshManager.loadFromGeometry(buildFloorGeometry({ minX: -5, minZ: -5, maxX: 5, maxZ: 5 }))
  const built = navMeshManager.getNavMesh()
  if (!built) throw new Error("navmesh did not build")
  navMesh = built
})

afterAll(() => navMeshManager.dispose())

/**
 * Agent indices with gaps and out of slot order, so the tests catch any mix-up between an agent's
 * index and the slot its character is stored in.
 */
const AGENT_INDICES = [7, 2, 5]

/** Movement buffers with each character (agent AGENT_INDICES[slot]) placed at the given (x, z). */
function buffersAt(...places: [number, number][]) {
  const positions = new Float32Array(places.length * MOVEMENT_STRIDE)
  places.forEach(([x, z], slot) => {
    positions[slot * MOVEMENT_STRIDE] = x
    positions[slot * MOVEMENT_STRIDE + 2] = z
    positions[slot * MOVEMENT_STRIDE + 3] = 1
  })
  const velocities = new Float32Array(places.length * MOVEMENT_STRIDE)
  const agents = AGENT_INDICES.slice(0, places.length)
  const buffers: MovementBuffers = {
    positions,
    velocities,
    slotOf: (agentIndex) => {
      const slot = agents.indexOf(agentIndex)
      return slot === -1 ? null : slot
    },
  }
  return { positions, velocities, buffers, agents }
}

/** A crowd with one agent per character, each where its buffers place it. */
function crowdFor(buffers: MovementBuffers, agents: number[]): CharacterCrowd {
  return new CharacterCrowd(
    navMesh,
    new Map(agents.map((agentIndex) => [agentIndex, startOf(buffers, agentIndex)])),
  )
}

function startOf(buffers: MovementBuffers, agentIndex: number) {
  const [x, z] = placeOf(buffers, agentIndex)
  return { x, y: 0, z }
}

/** Where an agent's character stands, read from the slot its buffers give it. */
function placeOf(buffers: MovementBuffers, agentIndex: number): [number, number] {
  const slot = buffers.slotOf(agentIndex)
  if (slot === null) throw new Error(`agent ${agentIndex} has no slot`)
  return [buffers.positions[slot * MOVEMENT_STRIDE], buffers.positions[slot * MOVEMENT_STRIDE + 2]]
}

function distanceBetween(buffers: MovementBuffers, first: number, second: number): number {
  const [firstX, firstZ] = placeOf(buffers, first)
  const [secondX, secondZ] = placeOf(buffers, second)
  return Math.hypot(firstX - secondX, firstZ - secondZ)
}

/** Steps until nobody walks. Returns the frame each agent arrived on and the closest approach. */
function runUntilSettled(crowd: CharacterCrowd, buffers: MovementBuffers, agents: number[]) {
  const arrivedOnFrame = new Map<number, number>()
  let closestApproach = Number.POSITIVE_INFINITY
  for (let frame = 1; frame <= MAX_FRAMES; frame++) {
    for (const agentIndex of crowd.step(buffers, FRAME)) arrivedOnFrame.set(agentIndex, frame)
    for (let first = 0; first < agents.length; first++) {
      for (let second = first + 1; second < agents.length; second++) {
        closestApproach = Math.min(
          closestApproach,
          distanceBetween(buffers, agents[first], agents[second]),
        )
      }
    }
    if (!agents.some((agentIndex) => crowd.isWalking(agentIndex))) break
  }
  return { arrivedOnFrame, closestApproach }
}

describe("CharacterCrowd", () => {
  test("walks a character to its exact destination at walking speed, then holds it still", () => {
    const { velocities, buffers, agents } = buffersAt([-4, 0])
    const [walker] = agents
    const crowd = crowdFor(buffers, agents)

    expect(crowd.walk(walker, startOf(buffers, walker), 3.3, 0.7)).toBe(true)
    expect(crowd.isWalking(walker)).toBe(true)
    const { arrivedOnFrame } = runUntilSettled(crowd, buffers, agents)

    const idealFrames = Math.hypot(7.3, 0.7) / WALK_SPEED / FRAME
    expect(arrivedOnFrame.get(walker)).toBeGreaterThan(idealFrames - 15)
    expect(arrivedOnFrame.get(walker)).toBeLessThan(idealFrames + 10)
    expect(placeOf(buffers, walker)).toEqual([Math.fround(3.3), Math.fround(0.7)])
    expect(crowd.isWalking(walker)).toBe(false)
    crowd.step(buffers, FRAME)
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0])
    expect(placeOf(buffers, walker)).toEqual([Math.fround(3.3), Math.fround(0.7)])
    crowd.dispose()
  })

  test("records each frame's step as the velocity, on the ground plane", () => {
    const { positions, velocities, buffers, agents } = buffersAt([-4, 0])
    const [walker] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(walker, startOf(buffers, walker), 4, 0)
    for (let frame = 0; frame < 20; frame++) crowd.step(buffers, FRAME)

    expect(velocities[0]).toBeCloseTo(WALK_SPEED * FRAME, 3)
    expect(velocities[2]).toBeCloseTo(0, 3)
    expect(positions[1]).toBe(0)
    crowd.dispose()
  })

  test("writes each agent through its own slot", () => {
    const { buffers, agents } = buffersAt([-4, -3], [-4, 3], [3, 0])
    const [first, second, standing] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(second, startOf(buffers, second), 4, 3)

    runUntilSettled(crowd, buffers, agents)

    expect(placeOf(buffers, first)).toEqual([-4, -3])
    expect(placeOf(buffers, second)).toEqual([4, 3])
    expect(placeOf(buffers, standing)).toEqual([3, 0])
    crowd.dispose()
  })

  test("two characters walking head-on steer around each other and both arrive", () => {
    const { buffers, agents } = buffersAt([-4, 0], [4, 0])
    const [first, second] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(first, startOf(buffers, first), 4, 0)
    crowd.walk(second, startOf(buffers, second), -4, 0)

    const { arrivedOnFrame, closestApproach } = runUntilSettled(crowd, buffers, agents)

    expect(closestApproach).toBeGreaterThan(CHARACTER_RADIUS * 2 * 0.9)
    expect(arrivedOnFrame.size).toBe(2)
    expect(placeOf(buffers, first)).toEqual([4, 0])
    expect(placeOf(buffers, second)).toEqual([-4, 0])
    crowd.dispose()
  })

  test("a walker goes around a character standing in its way, which does not move", () => {
    const { buffers, agents } = buffersAt([-4, 0], [0, 0])
    const [walker, standing] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(walker, startOf(buffers, walker), 4, 0)

    const { arrivedOnFrame, closestApproach } = runUntilSettled(crowd, buffers, agents)

    expect(closestApproach).toBeGreaterThan(CHARACTER_RADIUS * 2 * 0.9)
    expect(arrivedOnFrame.get(walker)).toBeDefined()
    expect(placeOf(buffers, walker)).toEqual([4, 0])
    expect(placeOf(buffers, standing)).toEqual([0, 0])
    crowd.dispose()
  })

  test("a walker whose destination is taken still gets there, without moving the one standing on it", () => {
    const { buffers, agents } = buffersAt([-4, 0], [2, 0])
    const [walker, standing] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(walker, startOf(buffers, walker), 2, 0)

    const { arrivedOnFrame } = runUntilSettled(crowd, buffers, agents)

    expect(arrivedOnFrame.get(walker)).toBeDefined()
    expect(placeOf(buffers, walker)).toEqual([2, 0])
    expect(placeOf(buffers, standing)).toEqual([2, 0])
    crowd.dispose()
  })

  test("stop leaves a walker where it is, with zero velocity", () => {
    const { velocities, buffers, agents } = buffersAt([-4, 0])
    const [walker] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.walk(walker, startOf(buffers, walker), 4, 0)
    for (let frame = 0; frame < 30; frame++) crowd.step(buffers, FRAME)
    const stoppedAt = placeOf(buffers, walker)

    crowd.stop(walker)
    const arrived = crowd.step(buffers, FRAME)

    expect(arrived).toEqual([])
    expect(crowd.isWalking(walker)).toBe(false)
    expect(placeOf(buffers, walker)).toEqual(stoppedAt)
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0])
    crowd.dispose()
  })

  test("a character moved while standing still walks from where it was put", () => {
    const { positions, buffers, agents } = buffersAt([-4, 0])
    const [walker] = agents
    const crowd = crowdFor(buffers, agents)
    crowd.step(buffers, FRAME)
    positions[0] = 0
    positions[2] = -3

    crowd.walk(walker, startOf(buffers, walker), 0, 3)
    crowd.step(buffers, FRAME)

    const [x, z] = placeOf(buffers, walker)
    expect(x).toBeCloseTo(0, 2)
    expect(z).toBeGreaterThan(-3)
    expect(z).toBeLessThan(-2.9)
    crowd.dispose()
  })

  test("ignores an agent that is not on the roster", () => {
    const { buffers, agents } = buffersAt([-4, 0])
    const crowd = crowdFor(buffers, agents)

    expect(crowd.walk(99, { x: 0, y: 0, z: 0 }, 1, 1)).toBe(false)
    expect(crowd.isWalking(99)).toBe(false)
    expect(() => crowd.stop(99)).not.toThrow()
    crowd.dispose()
  })
})
