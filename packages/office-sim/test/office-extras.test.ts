import { describe, expect, test } from "bun:test"
import { MAX_WALK_GRID_CELLS, NavGridSchema, OfficeExtrasSchema } from "../src/office-extras"
import { tinyExtras } from "./support/tiny-office"
import { navFromMap } from "./support/walk-grid-map"

describe("OfficeExtrasSchema", () => {
  test("accepts a minimal office and drops documentation entries from the states", () => {
    const extras = tinyExtras()
    expect(Object.keys(extras.agentStates)).not.toContain("_format")
    expect(extras.agents.max).toBe(2)
  })

  test("rejects a state whose colour is not a status colour", () => {
    const extras = tinyExtras()
    const result = OfficeExtrasSchema.safeParse({
      ...extras,
      agentStates: {
        ...extras.agentStates,
        lost: { color: "purple", slots: [{ pois: ["poi-x-1"], clip: "Idle" }] },
      },
    })
    expect(result.success).toBe(false)
  })

  test("rejects a malformed state rather than ignoring it", () => {
    const extras = tinyExtras()
    const result = OfficeExtrasSchema.safeParse({
      ...extras,
      agentStates: { broken: { color: "green", slots: "none" } },
    })
    expect(result.success).toBe(false)
  })
})

describe("NavGridSchema", () => {
  test("accepts a well-formed grid", () => {
    expect(NavGridSchema.safeParse(navFromMap(["...", ".#."])).success).toBe(true)
  })

  test("rejects bits that do not match the grid size", () => {
    const nav = navFromMap(["........", "........"])
    expect(NavGridSchema.safeParse({ ...nav, rows: 3 }).success).toBe(false)
    expect(NavGridSchema.safeParse({ ...nav, bits: "!!!!" }).success).toBe(false)
  })

  test("rejects a grid over the cell cap before looking at its bits", () => {
    const nav = navFromMap(["."])
    const result = NavGridSchema.safeParse({ ...nav, cols: MAX_WALK_GRID_CELLS, rows: 2 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["cols"])
  })

  test("rejects non-integer or negative sizes", () => {
    const nav = navFromMap(["...."])
    expect(NavGridSchema.safeParse({ ...nav, cols: 1.5 }).success).toBe(false)
    expect(NavGridSchema.safeParse({ ...nav, cell: -1 }).success).toBe(false)
  })
})
