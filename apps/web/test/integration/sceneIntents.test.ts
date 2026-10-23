import { describe, expect, test } from "bun:test"
import type { Task, TaskStatus } from "@the-delegation/agents/project/types"
import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import {
  type ChatSceneState,
  chatIntents,
  initialSceneIntents,
  layoutIntents,
  type ProjectSceneState,
  projectIntents,
  selectionForClick,
  teamIntents,
} from "../../src/integration/sceneIntents"

function agent(index: number, subagents: AgentNode[] = []): AgentNode {
  return {
    id: `agent-${index}`,
    index,
    name: `Agent ${index}`,
    description: "",
    color: "#000000",
    model: "claude-sonnet-5-5",
    subagents,
  }
}

/** A team whose user is index 5 and whose agents are 7 (lead), 3 and 9, to catch index assumptions. */
function team(overrides: Partial<AgenticSystem> = {}): AgenticSystem {
  return {
    id: "team",
    teamName: "Team",
    teamType: "Custom",
    teamDescription: "",
    color: "#000000",
    user: { index: 5, model: "Human" },
    leadAgent: agent(7, [agent(3), agent(9)]),
    ...overrides,
  }
}

function task(id: string, assignedAgentId: number, status: TaskStatus): Task {
  return {
    id,
    title: id,
    description: "",
    assignedAgentId,
    status,
    requiresUserApproval: false,
    revisions: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

function project(tasks: Task[], phase: ProjectSceneState["phase"] = "working"): ProjectSceneState {
  return { tasks, phase }
}

const idleChat: ChatSceneState = {
  isChatting: false,
  isThinking: false,
  isTyping: false,
  selectedNpcIndex: null,
}

describe("projectIntents", () => {
  test("nothing when neither tasks nor phase changed", () => {
    const state = project([task("a", 3, "in_progress")])
    expect(projectIntents(state, { ...state }, team())).toEqual([])
  })

  test("a phase change only syncs the drivers", () => {
    const tasks = [task("a", 3, "done")]
    expect(projectIntents(project(tasks), project(tasks, "done"), team())).toEqual([
      { type: "syncAgentWork", work: { busyAgentIndices: [], isProjectDone: true } },
    ])
  })

  test("in progress goes to a desk picked by roster position", () => {
    const intents = projectIntents(
      project([task("a", 9, "scheduled")]),
      project([task("a", 9, "in_progress")]),
      team(),
    )
    expect(intents).toEqual([
      { type: "syncAgentWork", work: { busyAgentIndices: [9], isProjectDone: false } },
      { type: "goToDesk", agentIndex: 9, deskSlot: 2 },
    ])
  })

  test("the lead takes the first desk slot whatever its index", () => {
    const intents = projectIntents(project([]), project([task("a", 7, "in_progress")]), team())
    expect(intents).toContainEqual({ type: "goToDesk", agentIndex: 7, deskSlot: 0 })
  })

  test("on hold wins over in progress and goes to the boardroom", () => {
    const intents = projectIntents(
      project([task("a", 3, "in_progress"), task("b", 3, "scheduled")]),
      project([task("a", 3, "in_progress"), task("b", 3, "on_hold")]),
      team(),
    )
    expect(intents).toContainEqual({ type: "goToBoardroom", agentIndex: 3 })
    expect(intents.some((intent) => intent.type === "goToDesk")).toBe(false)
  })

  test("a task just done returns the agent to spawn", () => {
    const intents = projectIntents(
      project([task("a", 3, "in_progress")]),
      project([task("a", 3, "done")]),
      team(),
    )
    expect(intents).toContainEqual({ type: "returnToSpawn", agentIndex: 3 })
  })

  test("an agent whose task statuses did not change does not move", () => {
    const unchanged = task("a", 3, "in_progress")
    const intents = projectIntents(
      project([unchanged]),
      project([unchanged, task("b", 9, "scheduled")]),
      team(),
    )
    expect(intents.map((intent) => intent.type)).toEqual(["syncAgentWork"])
  })

  test("tasks for the user or for an agent off the roster never move a character", () => {
    const intents = projectIntents(
      project([]),
      project([task("a", 5, "in_progress"), task("b", 0, "in_progress"), task("c", 42, "on_hold")]),
      team(),
    )
    expect(intents.map((intent) => intent.type)).toEqual(["syncAgentWork"])
  })
})

describe("layoutIntents", () => {
  test("reports a Kanban resize starting and settling", () => {
    expect(
      layoutIntents(
        { viewMode: "simulation", isResizing: false },
        { viewMode: "simulation", isResizing: true },
      ),
    ).toEqual([{ type: "layoutResizeStarted" }])
    expect(
      layoutIntents(
        { viewMode: "simulation", isResizing: true },
        { viewMode: "simulation", isResizing: false },
      ),
    ).toEqual([{ type: "layoutResizeSettled" }])
  })

  test("reports a view mode change", () => {
    expect(
      layoutIntents(
        { viewMode: "simulation", isResizing: false },
        { viewMode: "design", isResizing: false },
      ),
    ).toEqual([{ type: "setViewMode", viewMode: "design" }])
  })
})

describe("chatIntents", () => {
  test("opening a chat with a selected agent starts it", () => {
    const selected = { ...idleChat, selectedNpcIndex: 3 }
    expect(chatIntents(selected, { ...selected, isChatting: true })).toEqual([
      { type: "setChatMode", isChatting: true },
      { type: "startChat", agentIndex: 3 },
      { type: "updateChatTurn", agentIndex: 3, isAgentSpeaking: false, isUserSpeaking: false },
    ])
  })

  test("thinking and typing change who speaks", () => {
    const chatting = { ...idleChat, isChatting: true, selectedNpcIndex: 3 }
    expect(chatIntents(chatting, { ...chatting, isThinking: true })).toEqual([
      { type: "updateChatTurn", agentIndex: 3, isAgentSpeaking: true, isUserSpeaking: false },
    ])
    expect(chatIntents(chatting, { ...chatting, isTyping: true })).toEqual([
      { type: "updateChatTurn", agentIndex: 3, isAgentSpeaking: false, isUserSpeaking: true },
    ])
  })

  test("closing a chat stops it with the agent it was with", () => {
    const chatting = { ...idleChat, isChatting: true, selectedNpcIndex: 3 }
    expect(chatIntents(chatting, { ...chatting, isChatting: false, selectedNpcIndex: 9 })).toEqual([
      { type: "setChatMode", isChatting: false },
      { type: "stopChat", agentIndex: 3 },
    ])
  })

  test("a chat opened with nobody selected only sets the chat mode", () => {
    expect(chatIntents(idleChat, { ...idleChat, isChatting: true })).toEqual([
      { type: "setChatMode", isChatting: true },
    ])
  })

  test("selection and hover changes alone do nothing", () => {
    expect(chatIntents(idleChat, { ...idleChat, selectedNpcIndex: 3 })).toEqual([])
  })
})

describe("teamIntents", () => {
  test("the same team object does nothing", () => {
    const current = team()
    expect(teamIntents(current, current)).toEqual([])
  })

  test("edited details of the same roster update the team", () => {
    const next = team({ teamName: "Renamed" })
    expect(teamIntents(team(), next)).toEqual([{ type: "updateTeam", team: next }])
  })

  test("a different team or roster replaces the team", () => {
    const otherTeam = team({ id: "other" })
    expect(teamIntents(team(), otherTeam)).toEqual([{ type: "replaceTeam", team: otherTeam }])
    const addedAgent = team({ leadAgent: agent(7, [agent(3), agent(9), agent(11)]) })
    expect(teamIntents(team(), addedAgent)).toEqual([{ type: "replaceTeam", team: addedAgent }])
  })
})

describe("initialSceneIntents", () => {
  test("pushes work, view mode, chat mode and an in-flight resize", () => {
    expect(
      initialSceneIntents(
        project([task("a", 3, "scheduled")], "working"),
        { viewMode: "design", isResizing: true },
        idleChat,
      ),
    ).toEqual([
      { type: "syncAgentWork", work: { busyAgentIndices: [3], isProjectDone: false } },
      { type: "setViewMode", viewMode: "design" },
      { type: "setChatMode", isChatting: false },
      { type: "layoutResizeStarted" },
    ])
  })
})

describe("selectionForClick", () => {
  test("clicking the user's own character selects nobody", () => {
    expect(selectionForClick(5, team())).toBeNull()
    expect(selectionForClick(3, team())).toBe(3)
    expect(selectionForClick(null, team())).toBeNull()
  })
})
