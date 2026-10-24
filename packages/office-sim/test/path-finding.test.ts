import { describe, expect, test } from "bun:test"
import type { FloorPoint } from "../src/floor-point"
import { findPath } from "../src/path-finding"
import { decodeWalkGrid, type WalkGrid } from "../src/walk-grid"
import { navFromMap } from "./support/walk-grid-map"

function expectStaysOnGrid(grid: WalkGrid, path: readonly FloorPoint[]): void {
  for (let segment = 1; segment < path.length; segment++) {
    const from = path[segment - 1]
    const to = path[segment]
    if (!from || !to) throw new Error("missing waypoint")
    expect(grid.hasClearLine(from, to)).toBe(true)
  }
}

describe("findPath", () => {
  test("goes straight when the line is clear", () => {
    const grid = decodeWalkGrid(navFromMap([".....", "....."]))
    expect(findPath(grid, [0.5, 0.5], [4.5, 1.5])).toEqual([
      [0.5, 0.5],
      [4.5, 1.5],
    ])
  })

  test("goes round an obstacle in few straight segments", () => {
    const grid = decodeWalkGrid(navFromMap([".......", "...#...", "...#...", "...#...", "......."]))
    const path = findPath(grid, [1.5, 2.5], [5.5, 2.5])
    if (!path) throw new Error("expected a path")
    expect(path[0]).toEqual([1.5, 2.5])
    expect(path.at(-1)).toEqual([5.5, 2.5])
    expect(path.length).toBeGreaterThan(2)
    expect(path.length).toBeLessThanOrEqual(4)
    expectStaysOnGrid(grid, path)
  })

  test("returns null when the goal is cut off", () => {
    const grid = decodeWalkGrid(navFromMap(["..#..", "..#..", "..#.."]))
    expect(findPath(grid, [0.5, 1.5], [4.5, 1.5])).toBeNull()
  })

  test("never cuts a blocked corner diagonally", () => {
    const grid = decodeWalkGrid(navFromMap([".#", "#."]))
    expect(grid.hasClearLine([0.5, 0.1], [1.9, 1.5])).toBe(false)
    expect(findPath(grid, [0.5, 0.1], [1.9, 1.5])).toBeNull()
  })

  test("starts from the nearest walkable cell when the start is just off the grid", () => {
    const grid = decodeWalkGrid(navFromMap(["#....", "#.#..", "#...."]))
    const path = findPath(grid, [0.5, 1.5], [3.5, 1.5])
    expect(path?.[0]).toEqual([0.5, 1.5])
    expect(path?.at(-1)).toEqual([3.5, 1.5])
  })
})
