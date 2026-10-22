import { describe, expect, test } from "bun:test"
import { backoffDelayMs, canChatWith } from "../../src/orchestration/policy"

describe("backoffDelayMs", () => {
  test("is zero before any failure, then doubles from 2 s and caps at 60 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(backoffDelayMs)).toEqual([
      0, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ])
  })
})

describe("canChatWith", () => {
  test("only the lead can chat before the project starts", () => {
    expect(canChatWith({ phase: "idle", isLead: true, status: undefined })).toBe(true)
    expect(canChatWith({ phase: "idle", isLead: false, status: "idle" })).toBe(false)
  })

  test("idle agents can chat while working; busy ones cannot", () => {
    expect(canChatWith({ phase: "working", isLead: false, status: "idle" })).toBe(true)
    expect(canChatWith({ phase: "working", isLead: true, status: "working" })).toBe(false)
    expect(canChatWith({ phase: "working", isLead: false, status: "on_hold" })).toBe(false)
  })

  test("nobody can chat once the project is done", () => {
    expect(canChatWith({ phase: "done", isLead: true, status: "idle" })).toBe(false)
  })
})
