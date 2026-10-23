import { z } from "zod"
import { MAX_TASKS_PER_PROJECT } from "../../orchestration/policy"
import { getAgentRoster, getSubtreeIndices, isLeadAgent, isUserIndex } from "../../team"
import { defineTool, optionalFlag, optionalInteger, requiredText } from "./toolArgs"
import { fail } from "./types"

export const proposeTask = defineTool({
  name: "propose_task",
  description: "Assign task to agent.",
  args: z.strictObject({
    title: requiredText(200),
    description: requiredText(4_000),
    agentId: optionalInteger().describe(
      "Agent index. Leave it out to assign the task to yourself.",
    ),
    requiresApproval: optionalFlag(),
  }),

  isOffered: (agent, team, phase) =>
    phase === "working" && (isLeadAgent(team, agent.index) || (agent.subagents?.length ?? 0) > 0),

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
      requiresUserApproval: args.requiresApproval ?? false,
    })
    project.logAction({
      agentIndex: agent.index,
      action: `proposed task: "${args.title}"`,
      taskId: task.id,
    })
    return { ok: true, summary: `Task "${args.title}" added to the board as ${task.id}.` }
  },
})
