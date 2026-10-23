import { describe, expect, test } from "bun:test"
import type { AgenticSystem } from "@the-delegation/agents/team"
import { withServedModels } from "../../../src/integration/store/team-models"

function team(leadModel: string, subagentModel: string): AgenticSystem {
  return {
    id: "custom",
    teamName: "Custom",
    teamType: "Custom",
    teamDescription: "",
    color: "#000000",
    user: { index: 0, model: "Human" },
    leadAgent: {
      id: "lead",
      index: 1,
      name: "Lead",
      description: "",
      color: "#000000",
      model: leadModel,
      subagents: [
        {
          id: "dev",
          index: 2,
          name: "Dev",
          description: "",
          color: "#000000",
          model: subagentModel,
          subagents: [
            {
              id: "qa",
              index: 3,
              name: "QA",
              description: "",
              color: "#000",
              model: subagentModel,
            },
          ],
        },
      ],
    },
  }
}

describe("withServedModels", () => {
  test("replaces Gemini ids with Opus for the lead and Sonnet for everyone else", () => {
    const migrated = withServedModels(team("gemini-3.1-pro-preview", "gemini-3-flash-preview"))
    expect(migrated.leadAgent.model).toBe("claude-opus-5-5")
    expect(migrated.leadAgent.subagents?.[0]?.model).toBe("claude-sonnet-5-5")
    expect(migrated.leadAgent.subagents?.[0]?.subagents?.[0]?.model).toBe("claude-sonnet-5-5")
    expect(migrated.user.model).toBe("Human")
  })

  test("keeps models the gateway serves, including a chosen OpenAI model", () => {
    const original = team("gpt-6-astra", "claude-opus-5-5")
    expect(withServedModels(original)).toBe(original)
  })

  test("fixes only the agents that need it", () => {
    const migrated = withServedModels(team("claude-opus-5-5", "gemini-3-flash-preview"))
    expect(migrated.leadAgent.model).toBe("claude-opus-5-5")
    expect(migrated.leadAgent.subagents?.[0]?.model).toBe("claude-sonnet-5-5")
  })
})
