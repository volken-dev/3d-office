import { describe, expect, test } from "bun:test"
import {
  MOVEMENT_STRIDE,
  type MovementTargets,
  stepCharacterMovement,
  walkStepLength,
} from "../../../src/simulation/behavior/characterMovement"
import { AgentBehavior } from "../../../src/types"

const FRAME_AT_60_FPS = 1 / 60
const STEP_AT_60_FPS = 0.045

interface Target {
  mode: AgentBehavior
  waypointX: number
  waypointZ: number
}

function targetsOf(targets: Target[]): MovementTargets {
  return {
    getState: (index) => targets[index].mode,
    getWaypointX: (index) => targets[index].waypointX,
    getWaypointZ: (index) => targets[index].waypointZ,
  }
}

function buffersFor(count: number) {
  return {
    positions: new Float32Array(count * MOVEMENT_STRIDE),
    velocities: new Float32Array(count * MOVEMENT_STRIDE),
  }
}

describe("walkStepLength", () => {
  test("walks 0.045 units per frame at 60 fps", () => {
    expect(walkStepLength(FRAME_AT_60_FPS)).toBeCloseTo(STEP_AT_60_FPS, 6)
  })

  test("scales with frame time so speed per second does not depend on refresh rate", () => {
    expect(walkStepLength(1 / 30)).toBeCloseTo(STEP_AT_60_FPS * 2, 6)
  })

  test("never drops below a quarter step, keeping the walk velocity above the facing threshold", () => {
    expect(walkStepLength(1 / 480)).toBeCloseTo(STEP_AT_60_FPS / 4, 6)
  })
})

describe("stepCharacterMovement", () => {
  test("a GOTO walker steps toward its waypoint and records the step as its velocity", () => {
    const { positions, velocities } = buffersFor(1)
    const targets = targetsOf([{ mode: AgentBehavior.GOTO, waypointX: 3, waypointZ: 4 }])

    stepCharacterMovement(positions, velocities, targets, 1, FRAME_AT_60_FPS)

    expect(positions[0]).toBeCloseTo(STEP_AT_60_FPS * 0.6, 6)
    expect(positions[2]).toBeCloseTo(STEP_AT_60_FPS * 0.8, 6)
    expect(positions[3]).toBe(1)
    expect(velocities[0]).toBeCloseTo(STEP_AT_60_FPS * 0.6, 6)
    expect(velocities[2]).toBeCloseTo(STEP_AT_60_FPS * 0.8, 6)
  })

  test("a GOTO walker above the floor is pulled toward the ground plane", () => {
    const { positions, velocities } = buffersFor(1)
    positions[1] = 1
    const targets = targetsOf([{ mode: AgentBehavior.GOTO, waypointX: 0, waypointZ: 0 }])

    stepCharacterMovement(positions, velocities, targets, 1, FRAME_AT_60_FPS)

    expect(positions[1]).toBeCloseTo(1 - STEP_AT_60_FPS, 6)
  })

  test("inside the arrival radius a walker snaps onto the waypoint and keeps its last velocity", () => {
    const { positions, velocities } = buffersFor(1)
    positions[0] = 0.9
    velocities[0] = STEP_AT_60_FPS
    const targets = targetsOf([{ mode: AgentBehavior.GOTO, waypointX: 1, waypointZ: 0.1 }])

    stepCharacterMovement(positions, velocities, targets, 1, FRAME_AT_60_FPS)

    expect(positions[0]).toBeCloseTo(1, 6)
    expect(positions[2]).toBeCloseTo(0.1, 6)
    expect(velocities[0]).toBeCloseTo(STEP_AT_60_FPS, 6)
  })

  test("reaches a distant waypoint in the number of frames its speed implies", () => {
    const { positions, velocities } = buffersFor(1)
    const targets = targetsOf([{ mode: AgentBehavior.GOTO, waypointX: 4.5, waypointZ: 0 }])
    let frames = 0
    while (positions[0] < 4.5 && frames < 1000) {
      stepCharacterMovement(positions, velocities, targets, 1, FRAME_AT_60_FPS)
      frames++
    }
    expect(positions[0]).toBeCloseTo(4.5, 5)
    expect(frames).toBe(97)
  })

  test("IDLE and SEATED characters stay put with zero velocity", () => {
    const { positions, velocities } = buffersFor(2)
    positions.set([1, 0, 2, 1, -3, 0.5, 4, 1])
    velocities.fill(0.2)
    const targets = targetsOf([
      { mode: AgentBehavior.IDLE, waypointX: 0.5, waypointZ: 0.5 },
      { mode: AgentBehavior.SEATED, waypointX: 9, waypointZ: 9 },
    ])

    stepCharacterMovement(positions, velocities, targets, 2, FRAME_AT_60_FPS)

    expect(Array.from(positions)).toEqual([1, 0, 2, 1, -3, 0.5, 4, 1])
    expect(Array.from(velocities)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  test("steps each character independently", () => {
    const { positions, velocities } = buffersFor(2)
    const targets = targetsOf([
      { mode: AgentBehavior.IDLE, waypointX: 5, waypointZ: 0 },
      { mode: AgentBehavior.GOTO, waypointX: 0, waypointZ: -5 },
    ])

    stepCharacterMovement(positions, velocities, targets, 2, FRAME_AT_60_FPS)

    expect(positions[0]).toBe(0)
    expect(positions[MOVEMENT_STRIDE + 2]).toBeCloseTo(-STEP_AT_60_FPS, 6)
  })
})
