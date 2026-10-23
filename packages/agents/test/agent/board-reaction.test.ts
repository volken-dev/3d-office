import { describe, expect, test } from "bun:test"
import { type HostView, reactToBoardChange } from "../../src/agent/board-reaction"
import type { ProjectSnapshot } from "../../src/orchestration/ports"
import type { Task, TaskStatus } from "../../src/project/types"

function taskOf(id: string, status: TaskStatus, assignedAgentId = 3): Task {
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

function snapshot(tasks: Task[], runId = 1): ProjectSnapshot {
  return { runId, phase: "working", tasks, autonomyPause: null }
}

const working: HostView = { agentIndex: 3, state: "working", currentTaskId: "task-1" }

describe("reactToBoardChange", () => {
  test("a reset aborts the call and frees a busy agent", () => {
    const before = snapshot([taskOf("task-1", "in_progress")])
    expect(reactToBoardChange(snapshot([], 2), before, working)).toEqual({
      abortTurn: true,
      releaseHost: true,
    })
    const idle: HostView = { agentIndex: 3, state: "idle", currentTaskId: null }
    expect(reactToBoardChange(snapshot([], 2), before, idle).releaseHost).toBe(false)
  })

  test("removing the agent's task aborts the call and frees it", () => {
    const before = snapshot([taskOf("task-1", "in_progress")])
    expect(reactToBoardChange(snapshot([]), before, working)).toEqual({
      abortTurn: true,
      releaseHost: true,
    })
  })

  test("a reviewed agent is freed once none of its tasks are under review", () => {
    const onHold: HostView = { agentIndex: 3, state: "on_hold", currentTaskId: "task-1" }
    const before = snapshot([taskOf("task-1", "on_hold")])
    expect(reactToBoardChange(snapshot([taskOf("task-1", "done")]), before, onHold)).toEqual({
      abortTurn: false,
      releaseHost: true,
    })
    const stillReviewing = snapshot([taskOf("task-1", "on_hold"), taskOf("task-2", "scheduled")])
    expect(reactToBoardChange(stillReviewing, before, onHold).releaseHost).toBe(false)
  })

  test("ignores changes that do not touch the board", () => {
    const tasks = [taskOf("task-1", "in_progress")]
    const before = snapshot(tasks)
    expect(reactToBoardChange({ ...before, phase: "done" }, before, working)).toEqual({
      abortTurn: false,
      releaseHost: false,
    })
  })
})
