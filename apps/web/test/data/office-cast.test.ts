import { describe, expect, test } from "bun:test"
import { OFFICE_CAST } from "../../src/data/office-cast"

describe("OFFICE_CAST", () => {
  test("seats five robots in slots 1 to 5, each once", () => {
    expect(OFFICE_CAST.agentIndices).toEqual([1, 2, 3, 4, 5])
  })
})
