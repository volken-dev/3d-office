import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { NavMesh } from "@recast-navigation/core"
import { MOVEMENT_STRIDE, WALK_SPEED } from "../../../src/simulation/behavior/characterMovement"
import {
  CHARACTER_RADIUS,
  CharacterCrowd,
} from "../../../src/simulation/pathfinding/CharacterCrowd"
import { NavMeshManager } from "../../../src/simulation/pathfinding/NavMeshManager"
import { loadNavigationRuntime } from "../../../src/simulation/pathfinding/navigationRuntime"
import { buildFloorGeometry } from "../../support/floorGeometry"

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

/** Movement buffers with each character placed at the given (x, z). */
function buffersAt(...places: [number, number][]) {
  const positions = new Float32Array(places.length * MOVEMENT_STRIDE)
  places.forEach(([x, z], index) => {
    positions[index * MOVEMENT_STRIDE] = x
    positions[index * MOVEMENT_STRIDE + 2] = z
    positions[index * MOVEMENT_STRIDE + 3] = 1
  })
  return { positions, velocities: new Float32Array(places.length * MOVEMENT_STRIDE) }
}

function placeOf(positions: Float32Array, index: number): [number, number] {
  return [positions[index * MOVEMENT_STRIDE], positions[index * MOVEMENT_STRIDE + 2]]
}

function distanceBetween(positions: Float32Array, first: number, second: number): number {
  const [firstX, firstZ] = placeOf(positions, first)
  const [secondX, secondZ] = placeOf(positions, second)
  return Math.hypot(firstX - secondX, firstZ - secondZ)
}

/** Steps until nobody walks. Returns the frame each character arrived on and the closest approach. */
function runUntilSettled(
  crowd: CharacterCrowd,
  positions: Float32Array,
  velocities: Float32Array,
  count: number,
) {
  const arrivedOnFrame = new Map<number, number>()
  let closestApproach = Number.POSITIVE_INFINITY
  for (let frame = 1; frame <= MAX_FRAMES; frame++) {
    for (const index of crowd.step(positions, velocities, FRAME)) arrivedOnFrame.set(index, frame)
    for (let first = 0; first < count; first++) {
      for (let second = first + 1; second < count; second++) {
        closestApproach = Math.min(closestApproach, distanceBetween(positions, first, second))
      }
    }
    const anyoneWalking = Array.from({ length: count }, (_, index) => crowd.isWalking(index)).some(
      Boolean,
    )
    if (!anyoneWalking) break
  }
  return { arrivedOnFrame, closestApproach }
}

describe("CharacterCrowd", () => {
  test("walks a character to its exact destination at walking speed, then holds it still", () => {
    const { positions, velocities } = buffersAt([-4, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 1)

    expect(crowd.walk(0, positions, 3.3, 0.7)).toBe(true)
    expect(crowd.isWalking(0)).toBe(true)
    const { arrivedOnFrame } = runUntilSettled(crowd, positions, velocities, 1)

    const idealFrames = Math.hypot(7.3, 0.7) / WALK_SPEED / FRAME
    expect(arrivedOnFrame.get(0)).toBeGreaterThan(idealFrames - 15)
    expect(arrivedOnFrame.get(0)).toBeLessThan(idealFrames + 10)
    expect(placeOf(positions, 0)).toEqual([Math.fround(3.3), Math.fround(0.7)])
    expect(crowd.isWalking(0)).toBe(false)
    crowd.step(positions, velocities, FRAME)
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0])
    expect(placeOf(positions, 0)).toEqual([Math.fround(3.3), Math.fround(0.7)])
    crowd.dispose()
  })

  test("records each frame's step as the velocity, on the ground plane", () => {
    const { positions, velocities } = buffersAt([-4, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 1)
    crowd.walk(0, positions, 4, 0)
    for (let frame = 0; frame < 20; frame++) crowd.step(positions, velocities, FRAME)

    expect(velocities[0]).toBeCloseTo(WALK_SPEED * FRAME, 3)
    expect(velocities[2]).toBeCloseTo(0, 3)
    expect(positions[1]).toBe(0)
    crowd.dispose()
  })

  test("two characters walking head-on steer around each other and both arrive", () => {
    const { positions, velocities } = buffersAt([-4, 0], [4, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 2)
    crowd.walk(0, positions, 4, 0)
    crowd.walk(1, positions, -4, 0)

    const { arrivedOnFrame, closestApproach } = runUntilSettled(crowd, positions, velocities, 2)

    expect(closestApproach).toBeGreaterThan(CHARACTER_RADIUS * 2 * 0.9)
    expect(arrivedOnFrame.size).toBe(2)
    expect(placeOf(positions, 0)).toEqual([4, 0])
    expect(placeOf(positions, 1)).toEqual([-4, 0])
    crowd.dispose()
  })

  test("a walker goes around a character standing in its way, which does not move", () => {
    const { positions, velocities } = buffersAt([-4, 0], [0, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 2)
    crowd.walk(0, positions, 4, 0)

    const { arrivedOnFrame, closestApproach } = runUntilSettled(crowd, positions, velocities, 2)

    expect(closestApproach).toBeGreaterThan(CHARACTER_RADIUS * 2 * 0.9)
    expect(arrivedOnFrame.get(0)).toBeDefined()
    expect(placeOf(positions, 0)).toEqual([4, 0])
    expect(placeOf(positions, 1)).toEqual([0, 0])
    crowd.dispose()
  })

  test("a walker whose destination is taken still gets there, without moving the one standing on it", () => {
    const { positions, velocities } = buffersAt([-4, 0], [2, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 2)
    crowd.walk(0, positions, 2, 0)

    const { arrivedOnFrame } = runUntilSettled(crowd, positions, velocities, 2)

    expect(arrivedOnFrame.get(0)).toBeDefined()
    expect(placeOf(positions, 0)).toEqual([2, 0])
    expect(placeOf(positions, 1)).toEqual([2, 0])
    crowd.dispose()
  })

  test("stop leaves a walker where it is, with zero velocity", () => {
    const { positions, velocities } = buffersAt([-4, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 1)
    crowd.walk(0, positions, 4, 0)
    for (let frame = 0; frame < 30; frame++) crowd.step(positions, velocities, FRAME)
    const stoppedAt = placeOf(positions, 0)

    crowd.stop(0)
    const arrived = crowd.step(positions, velocities, FRAME)

    expect(arrived).toEqual([])
    expect(crowd.isWalking(0)).toBe(false)
    expect(placeOf(positions, 0)).toEqual(stoppedAt)
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0])
    crowd.dispose()
  })

  test("a character moved while standing still walks from where it was put", () => {
    const { positions, velocities } = buffersAt([-4, 0])
    const crowd = new CharacterCrowd(navMesh, positions, 1)
    crowd.step(positions, velocities, FRAME)
    positions[0] = 0
    positions[2] = -3

    crowd.walk(0, positions, 0, 3)
    crowd.step(positions, velocities, FRAME)

    const [x, z] = placeOf(positions, 0)
    expect(x).toBeCloseTo(0, 2)
    expect(z).toBeGreaterThan(-3)
    expect(z).toBeLessThan(-2.9)
    crowd.dispose()
  })
})
