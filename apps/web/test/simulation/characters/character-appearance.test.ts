import { describe, expect, test } from "bun:test"
import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import {
  appearanceFor,
  modelIdsUsedBy,
} from "../../../src/simulation/characters/character-appearance"

function agent(index: number, extra: Partial<AgentNode> = {}): AgentNode {
  return {
    id: `a${index}`,
    index,
    name: `A${index}`,
    description: "",
    color: "#000",
    model: "m",
    ...extra,
  }
}

function team(lead: Partial<AgentNode> = {}, member: Partial<AgentNode> = {}): AgenticSystem {
  return {
    id: "t",
    teamName: "T",
    teamType: "",
    teamDescription: "",
    color: "#000",
    user: { index: 0, model: "Human" },
    leadAgent: { ...agent(1, lead), subagents: [agent(2, member), agent(3)] },
  }
}

describe("appearanceFor", () => {
  test("the user is a plain human; the lead is the robot with headphones; others wear caps", () => {
    const system = team()
    expect(appearanceFor(system, 0)).toEqual({ modelId: "human", accessory: null })
    expect(appearanceFor(system, 1)).toEqual({ modelId: "robot", accessory: "headphones" })
    expect(appearanceFor(system, 2)).toEqual({ modelId: "human", accessory: "cap" })
  })

  test("an agent's own registered character wins, and an unknown one falls back to the default", () => {
    expect(appearanceFor(team({}, { character: "robot" }), 2).modelId).toBe("robot")
    expect(appearanceFor(team({ character: "human" }), 1).modelId).toBe("human")
    expect(appearanceFor(team({}, { character: "dragon" }), 2).modelId).toBe("human")
  })
})

describe("modelIdsUsedBy", () => {
  test("lists each model the team uses once", () => {
    expect(modelIdsUsedBy(team()).sort()).toEqual(["human", "robot"])
    expect(modelIdsUsedBy(team({ character: "human" }))).toEqual(["human"])
  })
})

describe("modelIdsUsedBy with a non-contiguous roster", () => {
  test("finds the lead model when the lead index is beyond the character count", () => {
    const sparse: AgenticSystem = {
      ...team(),
      user: { index: 5, model: "Human" },
      leadAgent: { ...agent(7), subagents: [agent(3), agent(9)] },
    }
    expect(modelIdsUsedBy(sparse).sort()).toEqual(["human", "robot"])
  })
})
