import { afterEach, describe, expect, jest, spyOn, test } from "bun:test"
import { SKIPPED } from "../../src/agent/model-turn"
import type { AgentHost } from "../../src/orchestration/agent-host"
import type { TeamOrchestratorDeps } from "../../src/orchestration/ports"
import { TeamOrchestrator } from "../../src/orchestration/team-orchestrator"
import type { AgentWorkStatus } from "../../src/project/types"
import { FakeProject } from "../support/fake-project"
import { TEST_TEAM } from "../support/team"

const team = TEST_TEAM
const lead = team.leadAgent
const engineer = team.leadAgent.subagents?.find((agent) => agent.id === "engineer")

/** Longer than the staggered task start (1 s plus up to 2 s of jitter). */
const TASK_START_WINDOW_MS = 3_000
const HEARTBEAT_MS = 5_000

class FakeChat {
  partner: number | null = null
  private readonly listeners = new Set<() => void>()

  chatPartner(): number | null {
    return this.partner
  }

  onChatClosed(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  close(): void {
    this.partner = null
    for (const listener of [...this.listeners]) listener()
  }
}

const orchestrators: TeamOrchestrator[] = []

function setup() {
  const project = new FakeProject()
  const chat = new FakeChat()
  const statuses = new Map<number, AgentWorkStatus>()
  const dependencies: TeamOrchestratorDeps = {
    project,
    team: { getTeam: () => team },
    createLLMClient: () => {
      throw new Error("The orchestrator tests stub every model turn")
    },
    events: { llmError: () => {}, autonomyPaused: () => {}, briefSet: () => {} },
    agentStatus: { setAgentStatus: (agentIndex, status) => statuses.set(agentIndex, status) },
    chat,
  }
  const orchestrator = new TeamOrchestrator(team, dependencies)
  orchestrators.push(orchestrator)
  return { project, chat, statuses, orchestrator }
}

function hostOf(orchestrator: TeamOrchestrator, agentIndex: number | undefined): AgentHost {
  const host = agentIndex === undefined ? undefined : orchestrator.getAgent(agentIndex)
  if (!host) throw new Error("Fixture team is missing an agent")
  return host
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 10; tick++) await Promise.resolve()
}

afterEach(() => {
  for (const orchestrator of orchestrators.splice(0)) orchestrator.dispose()
  jest.useRealTimers()
})

describe("TeamOrchestrator planning", () => {
  test("the lead plans once the project starts with an empty board", async () => {
    const { project, orchestrator } = setup()
    const spark = spyOn(hostOf(orchestrator, lead.index), "spark").mockResolvedValue(SKIPPED)

    project.startProject("Build a login page")
    await settle()

    expect(spark).toHaveBeenCalledTimes(1)
  })

  test("the lead does not plan while the user is chatting with it, and plans when the chat closes", async () => {
    const { project, chat, orchestrator } = setup()
    const spark = spyOn(hostOf(orchestrator, lead.index), "spark").mockResolvedValue(SKIPPED)
    chat.partner = lead.index

    project.startProject("Build a login page")
    await settle()
    expect(spark).not.toHaveBeenCalled()

    chat.close()
    await settle()
    expect(spark).toHaveBeenCalledTimes(1)
  })

  test("the lead delivers once every task is done", async () => {
    const { project, orchestrator } = setup()
    spyOn(hostOf(orchestrator, lead.index), "spark").mockResolvedValue(SKIPPED)
    const conclude = spyOn(hostOf(orchestrator, lead.index), "concludeProject").mockResolvedValue(
      SKIPPED,
    )
    project.startProject("Build a login page")
    const task = project.addTask({
      title: "Write the form",
      description: "Email and password fields",
      assignedAgentId: hostOf(orchestrator, engineer?.index).data.index,
      status: "on_hold",
      requiresUserApproval: true,
    })
    await settle()
    expect(conclude).not.toHaveBeenCalled()

    project.completeTask(task.id, "<form />")
    await settle()
    expect(conclude).toHaveBeenCalledTimes(1)
  })
})

describe("TeamOrchestrator task execution", () => {
  test("a scheduled task starts its free agent after the staggered delay", async () => {
    jest.useFakeTimers()
    const { project, statuses, orchestrator } = setup()
    const worker = hostOf(orchestrator, engineer?.index)
    const execute = spyOn(worker, "executeTask").mockResolvedValue(SKIPPED)
    project.startProject("Build a login page")

    const task = project.addTask({
      title: "Write the form",
      description: "Email and password fields",
      assignedAgentId: worker.data.index,
      status: "scheduled",
      requiresUserApproval: false,
    })
    await settle()

    expect(project.getTask(task.id)?.status).toBe("in_progress")
    expect(statuses.get(worker.data.index)).toBe("working")
    expect(execute).not.toHaveBeenCalled()

    jest.advanceTimersByTime(TASK_START_WINDOW_MS)
    await settle()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(task.id)
  })

  test("a disposed orchestrator starts nothing and reports no status", async () => {
    jest.useFakeTimers()
    const { project, statuses, orchestrator } = setup()
    const worker = hostOf(orchestrator, engineer?.index)
    const execute = spyOn(worker, "executeTask").mockResolvedValue(SKIPPED)
    const spark = spyOn(hostOf(orchestrator, lead.index), "spark").mockResolvedValue(SKIPPED)
    orchestrator.dispose()

    project.startProject("Build a login page")
    project.addTask({
      title: "Write the form",
      description: "Email and password fields",
      assignedAgentId: worker.data.index,
      status: "scheduled",
      requiresUserApproval: false,
    })
    jest.advanceTimersByTime(HEARTBEAT_MS * 2)
    await settle()

    expect(spark).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(statuses.size).toBe(0)
  })
})

describe("TeamOrchestrator chat", () => {
  test("refuses a message to a busy agent without recording it", async () => {
    const { project, orchestrator } = setup()
    const worker = hostOf(orchestrator, engineer?.index)
    const chat = spyOn(worker, "chat").mockResolvedValue(SKIPPED)
    project.startProject("Build a login page")
    worker.setTask("task-elsewhere")

    expect(await orchestrator.handleUserMessage(worker.data.index, "How is it going?")).toBe(false)
    expect(chat).not.toHaveBeenCalled()

    worker.setTask(null)
    expect(await orchestrator.handleUserMessage(worker.data.index, "How is it going?")).toBe(true)
    expect(chat).toHaveBeenCalledWith("How is it going?")
  })
})
