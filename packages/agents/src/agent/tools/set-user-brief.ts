import { z } from "zod"
import { isLeadAgent } from "../../team"
import { defineTool, requiredText } from "./tool-args"
import { fail } from "./types"

export const setUserBrief = defineTool({
  name: "set_user_brief",
  description: "Start project with brief.",
  args: z.strictObject({ brief: requiredText(4_000) }),

  isOffered: (agent, team, phase) => phase === "idle" && isLeadAgent(team, agent.index),

  run({ agent, team, project, events }, { brief }) {
    if (!isLeadAgent(team, agent.index)) return fail("Only the lead agent can set the brief.")
    if (project.snapshot().phase !== "idle") return fail("The project has already started.")

    project.startProject(brief)
    project.logAction({ agentIndex: agent.index, action: "defined project brief" })
    events.briefSet(agent.index)
    return { ok: true, summary: "Brief set. The project has started." }
  },
})
