import { describe, expect, test } from "bun:test"
import { isAgentState } from "../../src/data/agent-states"

describe("isAgentState", () => {
  test("accepts contract states and rejects anything else", () => {
    expect(isAgentState("waiting_for_input")).toBe(true)
    expect(isAgentState("queued")).toBe(true)
    expect(isAgentState("sleeping")).toBe(false)
  })
})
