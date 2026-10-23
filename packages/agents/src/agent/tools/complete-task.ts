import { z } from "zod"
import { defineTool, requiredText } from "./tool-args"
import { fail } from "./types"

export const completeTask = defineTool({
  name: "complete_task",
  description: "Finish task. Output must be raw content, no introductions or credit for the work.",
  args: z.strictObject({
    taskId: requiredText(100),
    output: requiredText(100_000).describe(
      "Task result in Markdown (e.g. code blocks, text, or research).",
    ),
  }),

  isOffered: (_agent, _team, phase) => phase === "working",

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
        content: [
          { type: "text", text: `I've finished **"${task.title}"** and submitted it for review.` },
        ],
        metadata: { reviewTaskId: taskId, displayOnly: true },
      })
      return { ok: true, summary: "Submitted for the user's review." }
    }

    project.completeTask(taskId, output)
    project.logAction({ agentIndex: agent.index, action: "completed task", taskId })
    return { ok: true, summary: "Task completed." }
  },
})
