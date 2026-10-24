import { describe, expect, test } from "bun:test"
import { OfficeAgent } from "../src/agent"
import {
  AVOIDANCE_LOOKAHEAD,
  FOLLOWING_GAP,
  ROBOT_RADIUS,
  type RobotBody,
  steeringFor,
} from "../src/avoidance"
import { createOfficeWorld, type OfficeWorld } from "../src/office-world"
import { FakeActor } from "./support/fake-actor"
import { openFloorWorld } from "./support/open-floor"
import { TINY_CONTRACT, TINY_POIS, tinyExtras } from "./support/tiny-office"

const FRAME = 1 / 30

/** A robot walking east (+x) from the middle of the open floor. */
function eastbound(x = 6, z = 2): RobotBody {
  return { x, z, headingX: 1, headingZ: 0, isWalking: true }
}

function walker(x: number, z: number, headingX: number, headingZ: number): RobotBody {
  return { x, z, headingX, headingZ, isWalking: true }
}

function standing(x: number, z: number): RobotBody {
  return { x, z, headingX: 0, headingZ: 0, isWalking: false }
}

describe("steeringFor", () => {
  const grid = openFloorWorld().grid

  test("a robot with nobody near walks on at full speed", () => {
    const self = eastbound()
    expect(steeringFor(self, [self], grid)).toEqual({ speedScale: 1, sideX: 0, sideZ: 0 })
  })

  test("follows a robot walking the same way, stopping at the following gap", () => {
    const self = eastbound()
    expect(steeringFor(self, [self, walker(6 + FOLLOWING_GAP, 2, 1, 0)], grid).speedScale).toBe(0)
    const partway = steeringFor(self, [self, walker(6 + 1.1, 2, 1, 0)], grid).speedScale
    expect(partway).toBeGreaterThan(0)
    expect(partway).toBeLessThan(1)
    const farAhead = walker(6 + AVOIDANCE_LOOKAHEAD + 0.1, 2, 1, 0)
    expect(steeringFor(self, [self, farAhead], grid).speedScale).toBe(1)
  })

  test("steps to its own right for a robot walking straight at it, slowing once it is close", () => {
    const self = eastbound()
    const atTwoMetres = steeringFor(self, [self, walker(8, 2, -1, 0)], grid)
    expect(atTwoMetres.sideX).toBeCloseTo(0, 9)
    expect(atTwoMetres.sideZ).toBeGreaterThan(0)
    expect(atTwoMetres.speedScale).toBe(1)
    const atOneMetre = steeringFor(self, [self, walker(7, 2, -1, 0)], grid)
    expect(atOneMetre.sideZ).toBeGreaterThan(0)
    expect(atOneMetre.speedScale).toBeLessThan(1)
  })

  test("keeps making room while the oncoming robot is alongside", () => {
    const self = eastbound()
    const steering = steeringFor(self, [self, walker(6 - 0.3, 2.2, -1, 0)], grid)
    expect(steering.sideZ).toBeGreaterThan(0)
  })

  test("gives way to a robot crossing from its right, not from its left", () => {
    const self = eastbound()
    const fromRight = walker(6 + 0.9, 2 + 0.3, 0, -1)
    const fromLeft = walker(6 + 0.9, 2 - 0.3, 0, 1)
    expect(steeringFor(self, [self, fromRight], grid).speedScale).toBeLessThan(1)
    expect(steeringFor(self, [self, fromLeft], grid).speedScale).toBe(1)
  })

  test("steps round a robot standing in its way, away from the side it is on", () => {
    const self = eastbound()
    const standingLeftOfLine = steeringFor(self, [self, standing(6.6, 1.9)], grid)
    expect(standingLeftOfLine.sideZ).toBeGreaterThan(0)
    expect(standingLeftOfLine.speedScale).toBeLessThan(1)
    const standingRightOfLine = steeringFor(self, [self, standing(6.6, 2.1)], grid)
    expect(standingRightOfLine.sideZ).toBeLessThan(0)
  })

  test("ignores robots off the walk grid, beside its line or behind it", () => {
    const tinyGrid = createOfficeWorld({
      extras: tinyExtras(),
      pois: TINY_POIS,
      contract: TINY_CONTRACT,
    }).grid
    const self = walker(5, 3.5, 1, 0)
    const insideTheWall = standing(6.5, 3.5)
    expect(steeringFor(self, [self, insideTheWall], tinyGrid).speedScale).toBe(1)
    const self2 = eastbound()
    const beside = standing(6.6, 2 + 2 * ROBOT_RADIUS + 0.01)
    const behind = standing(5.2, 2)
    expect(steeringFor(self2, [self2, beside, behind], grid)).toEqual({
      speedScale: 1,
      sideX: 0,
      sideZ: 0,
    })
  })
})

function robotAt(world: OfficeWorld, id: number, x: number, z: number, yaw = 0): OfficeAgent {
  const agent = new OfficeAgent({ id, desk: id, actor: new FakeActor(), world })
  agent.spawnAt(x, z, yaw)
  return agent
}

/** Steps until every robot settles; returns the closest any two came while one was walking. */
function walkAll(agents: readonly OfficeAgent[], budgetSeconds = 60): number {
  let closest = Number.POSITIVE_INFINITY
  for (let elapsed = 0; elapsed < budgetSeconds; elapsed += FRAME) {
    for (const agent of agents) agent.update(FRAME)
    agents.forEach((first, firstIndex) => {
      for (const second of agents.slice(firstIndex + 1)) {
        if (first.stepKind !== "walk" && second.stepKind !== "walk") continue
        closest = Math.min(closest, Math.hypot(first.x - second.x, first.z - second.z))
      }
    })
    if (agents.every((agent) => agent.settled)) return closest
  }
  throw new Error("robots did not settle")
}

describe("robots steering on the floor", () => {
  test("two robots walking straight at each other pass without touching", () => {
    const world = openFloorWorld()
    const westToEast = robotAt(world, 1, 1, 2)
    const eastToWest = robotAt(world, 2, 11, 2)
    westToEast.setState("east")
    eastToWest.setState("west")
    expect(walkAll([westToEast, eastToWest])).toBeGreaterThan(0.6)
    expect(westToEast.poi).toBe("poi-stand-east-1")
    expect(eastToWest.poi).toBe("poi-stand-west-1")
  })

  test("a robot walks round one standing in its way", () => {
    const world = openFloorWorld()
    const standingRobot = robotAt(world, 1, 6, 2)
    standingRobot.place("middle")
    const walkerRobot = robotAt(world, 2, 1, 2)
    walkerRobot.setState("east")
    expect(walkAll([standingRobot, walkerRobot])).toBeGreaterThan(0.5)
  })

  test("a robot following another keeps its distance", () => {
    const world = openFloorWorld()
    const leader = robotAt(world, 1, 2.2, 2)
    const follower = robotAt(world, 2, 1, 2)
    leader.setState("east")
    follower.setState("middle")
    expect(walkAll([leader, follower])).toBeGreaterThan(FOLLOWING_GAP - 0.15)
  })

  test("two robots that cannot pass in a narrow corridor still both arrive", () => {
    const world = openFloorWorld({ length: 12, width: 0.3 })
    const westToEast = robotAt(world, 1, 1, 0.15)
    const eastToWest = robotAt(world, 2, 11, 0.15)
    westToEast.setState("east")
    eastToWest.setState("west")
    walkAll([westToEast, eastToWest])
    expect(westToEast.settled && eastToWest.settled).toBe(true)
  })

  test("a removed robot is no longer steered round", () => {
    const world = openFloorWorld()
    const robot = robotAt(world, 1, 6, 2)
    robot.update(FRAME)
    expect(world.bodies.has(1)).toBe(true)
    robot.remove()
    expect(world.bodies.has(1)).toBe(false)
  })
})
