import { describe, expect, test } from "bun:test"
import {
  getToolDefinitions,
  parseToolCall,
  runToolCall,
} from "../../../src/core/agent/ToolRegistry"
import type { ToolContext } from "../../../src/core/agent/tools/types"
import { AGENTIC_SETS, getAgentByIndex } from "../../../src/data/agents"
import { FakeProject } from "../../support/fakeProject"

const team = AGENTIC_SETS[0]

function agentAt(index: number) {
  const agent = getAgentByIndex(team, index)
  if (!agent) throw new Error(`No agent at index ${index} in ${team.id}`)
  return agent
}

function toolNames(index: number, phase: "idle" | "working" | "done") {
  return getToolDefinitions(agentAt(index), team, phase).map((tool) => tool.function.name)
}

function contextFor(index: number, project = new FakeProject()): ToolContext {
  return {
    agent: agentAt(index),
    team,
    project,
    setStatus: () => {},
    appendHistory: (message) => project.appendHistory(index, message),
  }
}

describe("parseToolCall", () => {
  test("parses JSON object arguments", () => {
    const call = {
      id: "1",
      type: "function" as const,
      function: { name: "x", arguments: '{"a":1}' },
    }
    expect(parseToolCall(call)).toEqual({ name: "x", args: { a: 1 } })
  })

  test("turns malformed or non-object arguments into an empty object", () => {
    for (const argumentsText of ["not json", "[1,2]", "null", '"text"']) {
      const call = {
        id: "1",
        type: "function" as const,
        function: { name: "x", arguments: argumentsText },
      }
      expect(parseToolCall(call).args).toEqual({})
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
      { name: "deliver_project", args: { output: "Done" } },
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
      { name: "rm_rf", args: {} },
      new Set(["rm_rf"]),
    )
    expect(result.ok).toBe(false)
  })

  test("returns argument validation errors to the model instead of throwing", () => {
    const result = runToolCall(
      contextFor(team.leadAgent.index),
      { name: "complete_task", args: { taskId: "task-1" } },
      new Set(["complete_task"]),
    )
    expect(result).toEqual({ ok: false, error: '"output" must be a non-empty string.' })
  })
})
