import { fail, readString, type ToolSpec } from "./types"

export const completeTask: ToolSpec<{ taskId: string; output: string }> = {
  definition: {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Finish task. Output must be raw content, no introductions or credit for the work.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          output: {
            type: "string",
            description: "Task result in Markdown (e.g. code blocks, text, or research).",
          },
        },
        required: ["taskId", "output"],
      },
    },
  },

  isOffered: (_agent, _team, phase) => phase === "working",

  parseArgs(raw) {
    const taskId = readString(raw, "taskId", 100)
    if (!taskId.ok) return taskId
    const output = readString(raw, "output", 100_000)
    if (!output.ok) return output
    return { ok: true, value: { taskId: taskId.value, output: output.value } }
  },

  run({ agent, project, setStatus, appendHistory }, { taskId, output }) {
    const task = project.getTask(taskId)
    if (!task) return fail(`Unknown taskId "${taskId}". Use the id shown on the board.`)
    if (task.assignedAgentId !== agent.index)
      return fail(`Task "${task.title}" is not assigned to you.`)
    if (task.status !== "in_progress")
      return fail(
        `Task "${task.title}" is ${task.status}; only in-progress tasks can be completed.`,
      )

    if (agent.humanInTheLoop || task.requiresUserApproval) {
      project.submitTaskForReview(taskId, output)
      setStatus("on_hold")
      appendHistory({
        role: "assistant",
        content: `I've finished **"${task.title}"** and submitted it for review.`,
        metadata: { reviewTaskId: taskId },
      })
      return { ok: true }
    }

    project.completeTask(taskId, output)
    project.logAction({ agentIndex: agent.index, action: "completed task", taskId })
    return { ok: true }
  },
}
