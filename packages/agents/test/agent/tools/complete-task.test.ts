import { describe, expect, test } from "bun:test"
import { completeTask } from "../../../src/agent/tools/completeTask"
import { parseToolArgs } from "../../../src/agent/tools/toolArgs"
import type { ToolContext } from "../../../src/agent/tools/types"
import type { AgentWorkStatus } from "../../../src/project/types"
import type { AgentNode } from "../../../src/team"
import { FakeProject } from "../../support/fakeProject"
import { TEST_TEAM } from "../../support/team"

const team = TEST_TEAM
const reviewedAgent = team.leadAgent
const autonomousAgent = team.leadAgent.subagents?.find((agent) => !agent.humanInTheLoop)

function setup(agent: AgentNode, requiresUserApproval = false) {
  const project = new FakeProject()
  project.startProject("Build a login page")
  const task = project.addTask({
    title: "Write the form",
    description: "Email and password fields",
    assignedAgentId: agent.index,
    status: "in_progress",
    requiresUserApproval,
  })
  const statuses: AgentWorkStatus[] = []
  const context: ToolContext = {
    agent,
    team,
    project,
    events: { briefSet: () => {} },
    setStatus: (status) => statuses.push(status),
    appendHistory: (message) => project.appendHistory(agent.index, message),
  }
  return { project, task, statuses, context }
}

describe("completeTask.args", () => {
  test("requires both taskId and output", () => {
    expect(parseToolArgs(completeTask.args, { output: "x" }).ok).toBe(false)
    expect(parseToolArgs(completeTask.args, { taskId: "task-1" }).ok).toBe(false)
    expect(parseToolArgs(completeTask.args, { taskId: "task-1", output: " Done " })).toEqual({
      ok: true,
      value: { taskId: "task-1", output: "Done" },
    })
  })
})

describe("completeTask.run", () => {
  test("completes an in-progress task for an agent without review", () => {
    if (!autonomousAgent) throw new Error("Fixture team needs an agent without review")
    const { project, task, context } = setup(autonomousAgent)
    expect(completeTask.run(context, { taskId: task.id, output: "<form />" })).toEqual({
      ok: true,
      summary: "Task completed.",
    })
    expect(project.getTask(task.id)).toMatchObject({ status: "done", output: "<form />" })
  })

  test("submits the work for review when the agent has human-in-the-loop", () => {
    const { project, task, statuses, context } = setup(reviewedAgent)
    expect(completeTask.run(context, { taskId: task.id, output: "Plan" })).toEqual({
      ok: true,
      summary: "Submitted for the user's review.",
    })
    expect(project.getHistory(reviewedAgent.index).at(-1)?.metadata).toEqual({
      reviewTaskId: task.id,
      displayOnly: true,
    })
    expect(project.getTask(task.id)).toMatchObject({ status: "on_hold", draftOutput: "Plan" })
    expect(statuses).toEqual(["on_hold"])
  })

  test("refuses unknown tasks, other agents' tasks and tasks not in progress", () => {
    if (!autonomousAgent) throw new Error("Fixture team needs an agent without review")
    const { project, task, context } = setup(autonomousAgent)
    expect(completeTask.run(context, { taskId: "task-404", output: "x" }).ok).toBe(false)

    const otherContext: ToolContext = { ...context, agent: reviewedAgent }
    expect(completeTask.run(otherContext, { taskId: task.id, output: "x" }).ok).toBe(false)

    project.completeTask(task.id, "first")
    expect(completeTask.run(context, { taskId: task.id, output: "again" }).ok).toBe(false)
  })
})
