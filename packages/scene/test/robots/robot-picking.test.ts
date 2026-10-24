import { describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import { CLICK_TRAVEL_PIXELS, isClick, pickRobot } from "../../src/robots/robot-picking"

function rayFromAbove(x: number, z: number): THREE.Ray {
  const origin = new THREE.Vector3(x + 6, 8, z + 6)
  const direction = new THREE.Vector3(x, 0.8, z).sub(origin).normalize()
  return new THREE.Ray(origin, direction)
}

describe("isClick", () => {
  test("a press that barely moves is a click; one that travels is a drag", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true)
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(true)
    expect(isClick({ x: 10, y: 10 }, { x: 10 + CLICK_TRAVEL_PIXELS + 1, y: 10 })).toBe(false)
    expect(isClick({ x: 10, y: 10 }, { x: 40, y: 80 })).toBe(false)
  })
})

describe("pickRobot", () => {
  const robots = [
    { agentIndex: 1, position: new THREE.Vector3(0, 0, 0) },
    { agentIndex: 2, position: new THREE.Vector3(4, 0, 4) },
  ]

  test("picks the robot the ray passes through", () => {
    expect(pickRobot(rayFromAbove(0, 0), robots)).toBe(1)
    expect(pickRobot(rayFromAbove(4, 4), robots)).toBe(2)
  })

  test("empty floor picks nothing", () => {
    expect(pickRobot(rayFromAbove(-3, 2), robots)).toBeNull()
    expect(pickRobot(rayFromAbove(0, 0), [])).toBeNull()
  })

  test("of two robots in line, the nearer one wins", () => {
    const ray = new THREE.Ray(new THREE.Vector3(10, 0.8, 0), new THREE.Vector3(-1, 0, 0))
    const inLine = [
      { agentIndex: 3, position: new THREE.Vector3(0, 0, 0) },
      { agentIndex: 4, position: new THREE.Vector3(5, 0, 0) },
    ]
    expect(pickRobot(ray, inLine)).toBe(4)
  })
})
