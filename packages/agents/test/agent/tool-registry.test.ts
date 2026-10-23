import { describe, expect, test } from "bun:test"
import { type ToolCallBlock, ToolDefinitionSchema } from "@the-delegation/shared/llm-messages"
import { answerToolCalls, getToolDefinitions, runToolCall } from "../../src/agent/ToolRegistry"
import type { ToolContext } from "../../src/agent/tools/types"
import { getAgentRoster } from "../../src/team"
import { FakeProject } from "../support/fakeProject"
import { TEST_TEAM } from "../support/team"

const team = TEST_TEAM

function agentAt(index: number) {
  const agent = getAgentRoster(team).byIndex.get(index)
  if (!agent) throw new Error(`No agent at index ${index} in ${team.id}`)
  return agent
}

function toolNames(index: number, phase: "idle" | "working" | "done") {
  return getToolDefinitions(agentAt(index), team, phase).map((tool) => tool.name)
}

function contextFor(index: number, project = new FakeProject()): ToolContext {
  return {
    agent: agentAt(index),
    team,
    project,
    events: { briefSet: () => {} },
    setStatus: () => {},
    appendHistory: (message) => project.appendHistory(index, message),
  }
}

function call(name: string, input: Record<string, unknown>, id = "toolu_1"): ToolCallBlock {
  return { type: "tool_call", id, name, input }
}

const STRICT_UNSUPPORTED = ["minLength", "maxLength", "minimum", "maximum", "$schema"]

function allTools() {
  return (["idle", "working"] as const).flatMap((phase) =>
    getToolDefinitions(team.leadAgent, team, phase),
  )
}

describe("tool definitions", () => {
  test("every tool schema is a closed object, so providers can enforce it strictly", () => {
    for (const tool of allTools()) {
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.inputSchema.additionalProperties).toBe(false)
    }
  })

  test("every definition passes the gateway contract and uses only strict-safe keywords", () => {
    expect(allTools().map((tool) => tool.name)).toEqual([
      "set_user_brief",
      "propose_task",
      "complete_task",
      "deliver_project",
    ])
    for (const tool of allTools()) {
      expect(ToolDefinitionSchema.safeParse(tool).success).toBe(true)
      const serialized = JSON.stringify(tool.inputSchema)
      for (const keyword of STRICT_UNSUPPORTED) expect(serialized).not.toContain(`"${keyword}"`)
    }
  })
})

describe("getToolDefinitions", () => {
  test("offers only set_user_brief to the lead while idle", () => {
    expect(toolNames(team.leadAgent.index, "idle")).toEqual(["set_user_brief"])
  })

  test("offers planning and delivery to the lead while working", () => {
    expect(toolNames(team.leadAgent.index, "working")).toEqual(
      expect.arrayContaining(["propose_task", "complete_task", "deliver_project"]),
    )
  })

  test("never offers set_user_brief or deliver_project to a team agent", () => {
    const teamAgent = team.leadAgent.subagents?.[0]
    if (!teamAgent) throw new Error("Fixture team needs a subagent")
    for (const phase of ["idle", "working", "done"] as const) {
      const names = toolNames(teamAgent.index, phase)
      expect(names).not.toContain("set_user_brief")
      expect(names).not.toContain("deliver_project")
    }
  })
})

describe("runToolCall", () => {
  test("rejects a tool that was not offered with the request", () => {
    const result = runToolCall(
      contextFor(team.leadAgent.index),
      call("deliver_project", { output: "Done" }),
      new Set(["set_user_brief"]),
    )
    expect(result).toEqual({
      ok: false,
      error: 'Tool "deliver_project" is not available to you right now.',
    })
  })

  test("rejects an unknown tool", () => {
    const result = runToolCall(
      contextFor(team.leadAgent.index),
      call("rm_rf", {}),
      new Set(["rm_rf"]),
    )
    expect(result.ok).toBe(false)
  })

  test("returns argument validation errors to the model instead of throwing", () => {
    const result = runToolCall(
      contextFor(team.leadAgent.index),
      call("complete_task", { taskId: "task-1" }),
      new Set(["complete_task"]),
    )
    expect(result).toEqual({ ok: false, error: '"output" must be a non-empty string.' })
  })

  test("rejects a boolean agent id instead of assigning the task to agent 1", () => {
    const project = new FakeProject()
    project.startProject("Brief")
    const result = runToolCall(
      contextFor(team.leadAgent.index, project),
      call("propose_task", { title: "T", description: "D", agentId: true }),
      new Set(["propose_task"]),
    )
    expect(result).toEqual({ ok: false, error: '"agentId" must be an integer.' })
    expect(project.snapshot().tasks).toHaveLength(0)
  })
})

describe("answerToolCalls", () => {
  test("answers every call once, in order, with failures marked as errors", () => {
    const results = answerToolCalls(
      contextFor(team.leadAgent.index),
      [call("rm_rf", {}, "toolu_a"), call("complete_task", { taskId: "task-1" }, "toolu_b")],
      "tool_use",
      new Set(["complete_task"]),
    )
    expect(results.map((result) => [result.toolCallId, result.isError])).toEqual([
      ["toolu_a", true],
      ["toolu_b", true],
    ])
  })

  test("does not run calls from a truncated turn", () => {
    const project = new FakeProject()
    project.startProject("Brief")
    const results = answerToolCalls(
      contextFor(team.leadAgent.index, project),
      [call("propose_task", { title: "T", description: "D", agentId: 3 })],
      "max_tokens",
      new Set(["propose_task"]),
    )
    expect(results[0]?.isError).toBe(true)
    expect(project.snapshot().tasks).toHaveLength(0)
  })
})
