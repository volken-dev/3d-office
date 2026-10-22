import { isLeadAgent } from "../../team"
import { fail, readString, type ToolSpec } from "./types"

export const setUserBrief: ToolSpec<{ brief: string }> = {
  definition: {
    name: "set_user_brief",
    description: "Start project with brief.",
    inputSchema: {
      type: "object",
      properties: { brief: { type: "string" } },
      required: ["brief"],
      additionalProperties: false,
    },
  },

  isOffered: (agent, team, phase) => phase === "idle" && isLeadAgent(team, agent.index),

  parseArgs(raw) {
    const brief = readString(raw, "brief", 4_000)
    return !brief.ok ? brief : { ok: true, value: { brief: brief.value } }
  },

  run({ agent, team, project }, { brief }) {
    if (!isLeadAgent(team, agent.index)) return fail("Only the lead agent can set the brief.")
    if (project.snapshot().phase !== "idle") return fail("The project has already started.")

    project.startProject(brief)
    project.logAction({ agentIndex: agent.index, action: "defined project brief" })
    return { ok: true, summary: "Brief set. The project has started." }
  },
}
