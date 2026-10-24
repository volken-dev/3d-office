import { describe, expect, test } from "bun:test"
import { decodeWalkGrid } from "../src/walk-grid"
import { navFromMap } from "./support/walk-grid-map"

const MAP = ["....#", ".#..#", "....."]

describe("decodeWalkGrid", () => {
  test("reads one bit per cell, row-major, least significant bit first", () => {
    const grid = decodeWalkGrid(navFromMap(MAP))
    expect(grid.cols).toBe(5)
    expect(grid.rows).toBe(3)
    MAP.forEach((line, row) => {
      Array.from(line).forEach((character, column) => {
        expect(grid.isWalkableCell(column, row)).toBe(character === ".")
      })
    })
  })

  test("treats cells outside the grid as blocked", () => {
    const grid = decodeWalkGrid(navFromMap(MAP))
    expect(grid.isWalkableCell(-1, 0)).toBe(false)
    expect(grid.isWalkableCell(5, 0)).toBe(false)
    expect(grid.isWalkableCell(0, 3)).toBe(false)
  })

  test("maps world points to cells and back through the origin and cell size", () => {
    const grid = decodeWalkGrid(navFromMap(MAP, { cell: 0.5, origin: [-1, 2] }))
    expect(grid.cellOf(-0.9, 2.1)).toEqual([0, 0])
    expect(grid.cellOf(0.2, 3.4)).toEqual([2, 2])
    expect(grid.cellCentre(2, 2)).toEqual([0.25, 3.25])
    expect(grid.isWalkable(-0.9, 2.1)).toBe(true)
    expect(grid.isWalkable(-0.4, 2.6)).toBe(false)
  })

  test("sees a clear line only when every sample is walkable", () => {
    const grid = decodeWalkGrid(navFromMap(MAP))
    expect(grid.hasClearLine([0.5, 0.5], [3.5, 0.5])).toBe(true)
    expect(grid.hasClearLine([0.5, 1.5], [3.5, 1.5])).toBe(false)
    expect(grid.hasClearLine([0.5, 2.5], [4.5, 2.5])).toBe(true)
  })

  test("finds the nearest walkable cell by ring search", () => {
    const grid = decodeWalkGrid(navFromMap(MAP))
    expect(grid.nearestWalkableCell(1, 1)).toEqual([0, 0])
    expect(grid.nearestWalkableCell(2, 2)).toEqual([2, 2])
    const blocked = decodeWalkGrid(navFromMap(["####"]))
    expect(blocked.nearestWalkableCell(0, 0)).toBeNull()
  })

  test("refuses bits too short for the grid", () => {
    const nav = { ...navFromMap(MAP), cols: 50 }
    expect(() => decodeWalkGrid(nav)).toThrow()
  })
})
