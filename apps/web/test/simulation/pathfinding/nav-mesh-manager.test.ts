import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import {
  NAVMESH_EDGE_TOLERANCE,
  NavMeshManager,
} from "../../../src/simulation/pathfinding/NavMeshManager"
import { loadNavigationRuntime } from "../../../src/simulation/pathfinding/navigationRuntime"
import { buildFloorGeometry, type FloorRect } from "../../support/floorGeometry"

const FLOOR: FloorRect = { minX: -5, minZ: -5, maxX: 5, maxZ: 5 }
/** A table in the middle of the room that paths must go around. */
const TABLE: FloorRect = { minX: -2, minZ: -2, maxX: 2, maxZ: 2 }
/** A separate walkable patch that the room does not connect to. */
const ISLAND: FloorRect = { minX: 8, minZ: 8, maxX: 10, maxZ: 10 }

function point(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z)
}

function isInside(rect: FloorRect, position: THREE.Vector3): boolean {
  return (
    position.x > rect.minX &&
    position.x < rect.maxX &&
    position.z > rect.minZ &&
    position.z < rect.maxZ
  )
}

const navMesh = new NavMeshManager()

beforeAll(async () => {
  await loadNavigationRuntime()
  const room = buildFloorGeometry(FLOOR, [TABLE])
  const island = buildFloorGeometry(ISLAND)
  const islandStart = room.getAttribute("position").count
  const positions = [
    ...Array.from(room.getAttribute("position").array),
    ...Array.from(island.getAttribute("position").array),
  ]
  const indices = [
    ...Array.from(room.getIndex()?.array ?? []),
    ...Array.from(island.getIndex()?.array ?? []).map((index) => index + islandStart),
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  navMesh.loadFromGeometry(geometry)
})

afterAll(() => navMesh.dispose())

describe("NavMeshManager before a navmesh is loaded", () => {
  test("finds no path and treats no point as on the navmesh", () => {
    const empty = new NavMeshManager()
    expect(empty.getNavMesh()).toBeNull()
    expect(empty.isPointOnNavMesh(point(0, 0))).toBe(false)
    expect(empty.findPath(point(-4, 0), point(4, 0))).toEqual([])
  })
})

describe("NavMeshManager.loadFromGeometry", () => {
  test("builds a navmesh from the geometry's vertex positions", () => {
    expect(navMesh.getNavMesh()).not.toBeNull()
  })

  test("throws when the geometry has nothing walkable", () => {
    const wall = new THREE.BufferGeometry()
    wall.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 1, 1], 3))
    wall.setIndex([0, 1, 2])
    expect(() => new NavMeshManager().loadFromGeometry(wall)).toThrow("navmesh build failed")
  })
})

describe("NavMeshManager.isPointOnNavMesh", () => {
  test("is true on the floor and false in the table's hole and outside the room", () => {
    expect(navMesh.isPointOnNavMesh(point(-4, -4))).toBe(true)
    expect(navMesh.isPointOnNavMesh(point(3, 0))).toBe(true)
    expect(navMesh.isPointOnNavMesh(point(0, 0))).toBe(false)
    expect(navMesh.isPointOnNavMesh(point(7, 0))).toBe(false)
  })

  test("accepts points on the authored floor's very edge, which voxelising trims", () => {
    expect(navMesh.isPointOnNavMesh(point(4.99, 4.99))).toBe(true)
    expect(navMesh.isPointOnNavMesh(point(-1.99, 0))).toBe(true)
    expect(navMesh.isPointOnNavMesh(point(5 + NAVMESH_EDGE_TOLERANCE * 2, 0))).toBe(false)
  })
})

describe("NavMeshManager.findPath", () => {
  test("walks around the table, ending at the target and leaving out the start", () => {
    const from = point(-4, 0)
    const to = point(4, 0.5)
    const path = navMesh.findPath(from, to)

    expect(path.length).toBeGreaterThan(1)
    expect(path[0].distanceTo(from)).toBeGreaterThan(0.1)
    const end = path[path.length - 1]
    expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(0.01)

    let previous = from
    let length = 0
    for (const corner of path) {
      expect(navMesh.isPointOnNavMesh(corner)).toBe(true)
      expect(isInside(TABLE, previous.clone().lerp(corner, 0.5))).toBe(false)
      length += Math.hypot(corner.x - previous.x, corner.z - previous.z)
      previous = corner
    }
    expect(length).toBeGreaterThan(Math.hypot(to.x - from.x, to.z - from.z))
  })

  test("goes straight when nothing is in the way", () => {
    const path = navMesh.findPath(point(-4, -4), point(4, -4))
    expect(path).toHaveLength(1)
    expect(path[0].x).toBeCloseTo(4, 2)
    expect(path[0].z).toBeCloseTo(-4, 2)
  })

  test("returns no path when either end is off the navmesh", () => {
    expect(navMesh.findPath(point(-4, 0), point(0, 0))).toEqual([])
    expect(navMesh.findPath(point(0, 0), point(-4, 0))).toEqual([])
    expect(navMesh.findPath(point(-4, 0), point(20, 0))).toEqual([])
  })

  test("returns no path to a part of the navmesh that is not connected", () => {
    expect(navMesh.isPointOnNavMesh(point(9, 9))).toBe(true)
    expect(navMesh.findPath(point(-4, 0), point(9, 9))).toEqual([])
  })
})
