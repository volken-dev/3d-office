import { MAX_TASKS_PER_PROJECT } from "../../orchestration/policy"
import { getAgentRoster, getSubtreeIndices, isLeadAgent, isUserIndex } from "../../team"
import { fail, readString, type ToolSpec } from "./types"

interface ProposeTaskArgs {
  title: string
  description: string
  /** Undefined means "assign to myself". */
  agentId?: number
  requiresApproval: boolean
}

export const proposeTask: ToolSpec<ProposeTaskArgs> = {
  definition: {
    name: "propose_task",
    description: "Assign task to agent.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        agentId: { type: "integer", description: "Agent index" },
        requiresApproval: { type: "boolean" },
      },
      required: ["title", "description", "agentId"],
      additionalProperties: false,
    },
  },

  isOffered: (agent, team, phase) =>
    phase === "working" && (isLeadAgent(team, agent.index) || (agent.subagents?.length ?? 0) > 0),

  parseArgs(raw) {
    const title = readString(raw, "title", 200)
    if (!title.ok) return title
    const description = readString(raw, "description", 4_000)
    if (!description.ok) return description

    let agentId: number | undefined
    if (raw.agentId !== undefined && raw.agentId !== null && raw.agentId !== "") {
      agentId = Number(raw.agentId)
      if (!Number.isInteger(agentId)) return fail('"agentId" must be an integer agent index.')
    }
    return {
      ok: true,
      value: {
        title: title.value,
        description: description.value,
        agentId,
        requiresApproval: raw.requiresApproval === true,
      },
    }
  },

  run({ agent, team, project }, args) {
    const { phase, tasks } = project.snapshot()
    if (phase !== "working") return fail("Tasks can only be proposed while the project is working.")
    if (tasks.length >= MAX_TASKS_PER_PROJECT) {
      return fail(
        `The board already has ${MAX_TASKS_PER_PROJECT} tasks, the maximum. Finish existing tasks instead.`,
      )
    }

    const assignee = args.agentId ?? agent.index
    const { agents } = getAgentRoster(team)
    if (isUserIndex(team, assignee)) return fail("Tasks cannot be assigned to the user.")
    if (!agents.some((candidate) => candidate.index === assignee)) {
      return fail(
        `Agent ${assignee} does not exist. Valid agent ids: ${agents.map((candidate) => candidate.index).join(", ")}.`,
      )
    }
    if (
      !isLeadAgent(team, agent.index) &&
      assignee !== agent.index &&
      !getSubtreeIndices(agent).includes(assignee)
    ) {
      return fail("You can only assign tasks to yourself or your own subagents.")
    }

    const task = project.addTask({
      title: args.title,
      description: args.description,
      assignedAgentId: assignee,
      status: "scheduled",
      requiresUserApproval: args.requiresApproval,
    })
    project.logAction({
      agentIndex: agent.index,
      action: `proposed task: "${args.title}"`,
      taskId: task.id,
    })
    return { ok: true, summary: `Task "${args.title}" added to the board as ${task.id}.` }
  },
}
