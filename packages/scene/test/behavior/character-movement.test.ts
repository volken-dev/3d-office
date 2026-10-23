import { describe, expect, test } from "bun:test"
import {
  ARRIVAL_RADIUS,
  holdCharacterStill,
  isWithinArrivalRadius,
  MOVEMENT_STRIDE,
  WALK_SPEED,
  writeWalkerMotion,
} from "../../src/behavior/character-movement"

const FRAME_AT_60_FPS = 1 / 60

function buffersFor(count: number) {
  return {
    positions: new Float32Array(count * MOVEMENT_STRIDE),
    velocities: new Float32Array(count * MOVEMENT_STRIDE),
  }
}

describe("WALK_SPEED", () => {
  test("is the original 0.045 units per frame at 60 fps", () => {
    expect(WALK_SPEED * FRAME_AT_60_FPS).toBeCloseTo(0.045, 6)
  })
})

describe("writeWalkerMotion", () => {
  test("puts the walker on the ground plane and records this frame's step as its velocity", () => {
    const { positions, velocities } = buffersFor(2)
    positions[MOVEMENT_STRIDE + 1] = 0.05

    writeWalkerMotion(
      positions,
      velocities,
      1,
      { x: 1.5, z: -2, velocityX: 1.62, velocityZ: -2.16 },
      FRAME_AT_60_FPS,
    )

    expect(Array.from(positions.subarray(MOVEMENT_STRIDE))).toEqual([1.5, 0, -2, 1])
    expect(velocities[MOVEMENT_STRIDE]).toBeCloseTo(0.027, 6)
    expect(velocities[MOVEMENT_STRIDE + 1]).toBe(0)
    expect(velocities[MOVEMENT_STRIDE + 2]).toBeCloseTo(-0.036, 6)
    expect(Array.from(positions.subarray(0, MOVEMENT_STRIDE))).toEqual([0, 0, 0, 0])
  })

  test("scales the step with frame time, so speed per second does not depend on refresh rate", () => {
    const { positions, velocities } = buffersFor(1)
    const motion = { x: 0, z: 0, velocityX: WALK_SPEED, velocityZ: 0 }

    writeWalkerMotion(positions, velocities, 0, motion, 1 / 30)
    const stepAt30Fps = velocities[0]
    writeWalkerMotion(positions, velocities, 0, motion, 1 / 120)

    expect(stepAt30Fps).toBeCloseTo(velocities[0] * 4, 6)
  })
})

describe("holdCharacterStill", () => {
  test("keeps the position and zeroes the velocity", () => {
    const { positions, velocities } = buffersFor(1)
    positions.set([1, 0.0025, 2, 1])
    velocities.fill(0.2)

    holdCharacterStill(positions, velocities, 0)

    expect(Array.from(positions)).toEqual([1, Math.fround(0.0025), 2, 1])
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0])
  })
})

describe("isWithinArrivalRadius", () => {
  test("is true just inside the radius on the ground plane, whatever the height", () => {
    const { positions } = buffersFor(1)
    positions.set([1, 5, 1, 1])

    expect(isWithinArrivalRadius(positions, 0, 1 + ARRIVAL_RADIUS * 0.9, 1)).toBe(true)
    expect(isWithinArrivalRadius(positions, 0, 1, 1 - ARRIVAL_RADIUS * 1.1)).toBe(false)
  })
})
