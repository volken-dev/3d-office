import { describe, expect, test } from "bun:test"
import { completeTask } from "../../../../src/core/agent/tools/completeTask"
import type { ToolContext } from "../../../../src/core/agent/tools/types"
import { AGENTIC_SETS, type AgentNode } from "../../../../src/data/agents"
import type { AgentWorkStatus } from "../../../../src/types"
import { FakeProject } from "../../../support/fakeProject"

const team = AGENTIC_SETS[0]
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
    setStatus: (status) => statuses.push(status),
    appendHistory: (message) => project.appendHistory(agent.index, message),
  }
  return { project, task, statuses, context }
}

describe("completeTask.parseArgs", () => {
  test("requires both taskId and output", () => {
    expect(completeTask.parseArgs({ output: "x" }).ok).toBe(false)
    expect(completeTask.parseArgs({ taskId: "task-1" }).ok).toBe(false)
    expect(completeTask.parseArgs({ taskId: "task-1", output: " Done " })).toEqual({
      ok: true,
      value: { taskId: "task-1", output: "Done" },
    })
  })
})

describe("completeTask.run", () => {
  test("completes an in-progress task for an agent without review", () => {
    if (!autonomousAgent) throw new Error("Fixture team needs an agent without review")
    const { project, task, context } = setup(autonomousAgent)
    expect(completeTask.run(context, { taskId: task.id, output: "<form />" })).toEqual({ ok: true })
    expect(project.getTask(task.id)).toMatchObject({ status: "done", output: "<form />" })
  })

  test("submits the work for review when the agent has human-in-the-loop", () => {
    const { project, task, statuses, context } = setup(reviewedAgent)
    expect(completeTask.run(context, { taskId: task.id, output: "Plan" })).toEqual({ ok: true })
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
