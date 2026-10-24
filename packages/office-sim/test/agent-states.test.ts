import { describe, expect, test } from "bun:test"
import { agentStateNames, isAgentState, statusColorOf } from "../src/agent-states"
import { tinyExtras } from "./support/tiny-office"

describe("agent states", () => {
  test("lists the states without the documentation entries", () => {
    expect(agentStateNames(tinyExtras())).toEqual([
      "working",
      "waiting_for_input",
      "paused_or_rate_limited",
      "shipping",
      "arrive",
      "queued",
    ])
  })

  test("validates state names", () => {
    const extras = tinyExtras()
    expect(isAgentState(extras, "working")).toBe(true)
    expect(isAgentState(extras, "_format")).toBe(false)
    expect(isAgentState(extras, "toString")).toBe(false)
  })

  test("gives each state its status colour", () => {
    const extras = tinyExtras()
    expect(statusColorOf(extras, "working")).toBe("#2fbf71")
    expect(statusColorOf(extras, "queued")).toBe("#f2c230")
    expect(() => statusColorOf(extras, "dancing")).toThrow(/dancing/)
  })
})
