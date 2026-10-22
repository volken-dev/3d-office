import { describe, expect, test } from "bun:test"
import { readString } from "../../../src/agent/tools/types"

describe("readString", () => {
  test("returns the trimmed value", () => {
    expect(readString({ title: "  Ship it  " }, "title", 20)).toEqual({
      ok: true,
      value: "Ship it",
    })
  })

  test("rejects missing, blank and non-string values", () => {
    for (const raw of [{}, { title: "   " }, { title: 42 }, { title: null }]) {
      expect(readString(raw, "title", 20).ok).toBe(false)
    }
  })

  test("rejects values over the length cap", () => {
    const result = readString({ title: "x".repeat(21) }, "title", 20)
    expect(result).toEqual({ ok: false, error: '"title" is too long (21 characters, max 20).' })
  })
})
