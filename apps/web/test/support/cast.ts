import type { CastMember, SceneCast } from "../../src/simulation/scene-cast"

/** A cast of plain human characters: the user, then the lead (the first agent), then members. */
export function castOf(userIndex: number, agentIndices: readonly number[]): SceneCast {
  const user: CastMember = {
    index: userIndex,
    role: "user",
    modelId: "human",
    accessory: null,
    color: "#336699",
  }
  const agents = agentIndices.map(
    (index, order): CastMember => ({
      index,
      role: order === 0 ? "lead" : "member",
      modelId: "human",
      accessory: order === 0 ? "headphones" : "cap",
      color: "#336699",
    }),
  )
  return { themeColor: "#000000", members: [user, ...agents] }
}
