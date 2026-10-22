import { isLeadAgent } from "../../team"
import { fail, readString, type ToolSpec } from "./types"

export const deliverProject: ToolSpec<{ output: string }> = {
  definition: {
    name: "deliver_project",
    description: "Final delivery of the full project results.",
    inputSchema: {
      type: "object",
      properties: {
        output: {
          type: "string",
          description: "Full project document in Markdown. NO attribution needed.",
        },
      },
      required: ["output"],
      additionalProperties: false,
    },
  },

  isOffered: (agent, team, phase) => phase === "working" && isLeadAgent(team, agent.index),

  parseArgs(raw) {
    const output = readString(raw, "output", 100_000)
    return !output.ok ? output : { ok: true, value: { output: output.value } }
  },

  run({ agent, team, project }, { output }) {
    if (!isLeadAgent(team, agent.index)) return fail("Only the lead agent can deliver the project.")
    const { phase, tasks } = project.snapshot()
    if (phase !== "working") return fail("The project is not in progress.")
    if (project.isAwaitingOutputReview())
      return fail("A deliverable is already waiting for the user to review it.")

    const pending = tasks.filter((task) => task.status !== "done")
    if (pending.length > 0) {
      return fail(
        `You cannot deliver the project yet. Pending tasks: ${pending.map((task) => task.title).join(", ")}. All agents must finish their work first.`,
      )
    }

    const needsReview = team.outputAutoApprove === false
    if (needsReview) project.requestOutputReview(output)
    else project.finalizeOutput(output)
    project.logAction({ agentIndex: agent.index, action: "delivered final project results" })
    return {
      ok: true,
      summary: needsReview
        ? "Deliverable sent to the user for review."
        : "Deliverable accepted. The project is done.",
    }
  },
}
