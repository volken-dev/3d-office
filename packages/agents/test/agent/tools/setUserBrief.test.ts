import { describe, expect, test } from "bun:test"
import { setUserBrief } from "../../../src/agent/tools/setUserBrief"
import type { ToolContext } from "../../../src/agent/tools/types"
import { FakeProject } from "../../support/fakeProject"
import { TEST_TEAM } from "../../support/team"

describe("setUserBrief.run", () => {
  test("starts the project and announces the brief", () => {
    const project = new FakeProject()
    const announced: number[] = []
    const context: ToolContext = {
      agent: TEST_TEAM.leadAgent,
      team: TEST_TEAM,
      project,
      events: { briefSet: (agentIndex) => announced.push(agentIndex) },
      setStatus: () => {},
      appendHistory: () => {},
    }

    expect(setUserBrief.run(context, { brief: "Build a login page" }).ok).toBe(true)
    expect(project.snapshot().phase).toBe("working")
    expect(announced).toEqual([TEST_TEAM.leadAgent.index])

    expect(setUserBrief.run(context, { brief: "Again" }).ok).toBe(false)
    expect(announced).toHaveLength(1)
  })
})
