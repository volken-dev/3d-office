import { describe, expect, test } from "bun:test"
import { type AgenticSystem, type AgentNode, MAX_AGENTS } from "@the-delegation/agents/team"
import { WANDER_SPREAD_DIRECTIONS } from "@the-delegation/scene/constants"
import { getAllCharacters } from "../../src/data/agents"
import { castForTeam } from "../../src/integration/scene-cast"

function agent(index: number, extra: Partial<AgentNode> = {}): AgentNode {
  return {
    id: `agent-${index}`,
    index,
    name: `Agent ${index}`,
    description: "",
    color: `#00000${index}`,
    model: "claude-sonnet-5-5",
    ...extra,
  }
}

/** A team whose user is index 5 and whose agents are 7 (lead), 3 and 9, to catch index assumptions. */
function team(lead: Partial<AgentNode> = {}, member: Partial<AgentNode> = {}): AgenticSystem {
  return {
    id: "team",
    teamName: "Team",
    teamType: "",
    teamDescription: "",
    color: "#123456",
    user: { index: 5, model: "Human" },
    leadAgent: { ...agent(7, lead), subagents: [agent(3, member), agent(9)] },
  }
}

describe("castForTeam", () => {
  test("lists the user, then the lead, then members, with the team colour as the theme", () => {
    const cast = castForTeam(team())
    expect(cast.themeColor).toBe("#123456")
    expect(cast.members.map((member) => [member.index, member.role])).toEqual([
      [5, "user"],
      [7, "lead"],
      [3, "member"],
      [9, "member"],
    ])
  })

  test("the user is a plain human; the lead is the robot with headphones; members wear caps", () => {
    const [user, lead, member] = castForTeam(team()).members
    expect(user).toEqual({
      index: 5,
      role: "user",
      modelId: "human",
      accessory: null,
      color: getAllCharacters(team())[0]?.color,
    })
    expect(lead).toMatchObject({ modelId: "robot", accessory: "headphones", color: "#000007" })
    expect(member).toMatchObject({ modelId: "human", accessory: "cap", color: "#000003" })
  })

  test("an agent's own registered character wins, and an unknown one falls back to the default", () => {
    expect(castForTeam(team({}, { character: "robot" })).members[2]?.modelId).toBe("robot")
    expect(castForTeam(team({ character: "human" })).members[1]?.modelId).toBe("human")
    expect(castForTeam(team({}, { character: "dragon" })).members[2]?.modelId).toBe("human")
  })

  test("the scene spreads wandering agents across as many directions as a team can have agents", () => {
    expect(WANDER_SPREAD_DIRECTIONS).toBe(MAX_AGENTS)
  })
})
