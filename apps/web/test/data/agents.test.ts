import { describe, expect, test } from "bun:test"
import { getAllAgents, MAX_AGENTS } from "@the-delegation/agents/team"
import { AGENTIC_SETS } from "../../src/data/agents"

describe("team templates", () => {
  test("number agents 1 to MAX_AGENTS, the indices the office has spawn points and desks for", () => {
    for (const template of AGENTIC_SETS) {
      for (const agent of getAllAgents(template)) {
        expect(agent.index).toBeGreaterThanOrEqual(1)
        expect(agent.index).toBeLessThanOrEqual(MAX_AGENTS)
      }
    }
  })
})
