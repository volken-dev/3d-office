import { describe, expect, test } from "bun:test"
import {
  type AutonomyGateInput,
  nextAutonomyStep,
  pauseForError,
} from "../../src/orchestration/autonomy"
import { LLM_CALL_BUDGET, MAX_INTENT_ATTEMPTS } from "../../src/orchestration/policy"
import type { Task } from "../../src/project/types"
import { TEST_TEAM } from "../support/team"

const NOW = 100_000

function gate(changes: Partial<AutonomyGateInput> = {}): AutonomyGateInput {
  return {
    snapshot: { runId: 1, phase: "working", tasks: [], autonomyPause: null },
    runId: 1,
    budget: { used: 0, limit: LLM_CALL_BUDGET },
    attempts: undefined,
    now: NOW,
    agent: TEST_TEAM.leadAgent,
    task: undefined,
    ...changes,
  }
}

const task: Task = {
  id: "task-1",
  title: "Write the form",
  description: "",
  assignedAgentId: 3,
  status: "in_progress",
  requiresUserApproval: false,
  revisions: [],
  createdAt: 0,
  updatedAt: 0,
}

describe("nextAutonomyStep", () => {
  test("proceeds on a fresh intent", () => {
    expect(nextAutonomyStep(gate())).toEqual({ kind: "proceed" })
  })

  test("stops once the run is reset or the project leaves working", () => {
    expect(nextAutonomyStep(gate({ runId: 0 }))).toEqual({ kind: "stop" })
    const done = gate().snapshot
    expect(nextAutonomyStep(gate({ snapshot: { ...done, phase: "done" } }))).toEqual({
      kind: "stop",
    })
  })

  test("waits for the user while already paused, without pausing again", () => {
    const paused = { ...gate().snapshot, autonomyPause: { kind: "budget" as const, reason: "x" } }
    expect(nextAutonomyStep(gate({ snapshot: paused }))).toEqual({ kind: "await_resume" })
  })

  test("pauses for the budget once it is spent", () => {
    const step = nextAutonomyStep(gate({ budget: { used: 150, limit: 150 } }))
    expect(step).toMatchObject({ kind: "await_resume", pause: { kind: "budget" } })
  })

  test("pauses after the attempt cap, naming the task and the last error", () => {
    const step = nextAutonomyStep(
      gate({
        attempts: { count: MAX_INTENT_ATTEMPTS, lastAttemptAt: 0, lastError: "timeout" },
        task,
      }),
    )
    expect(step).toEqual({
      kind: "await_resume",
      pause: {
        kind: "failures",
        reason: `Tech Lead made no progress on "Write the form" after ${MAX_INTENT_ATTEMPTS} attempts: timeout`,
        taskId: "task-1",
        agentIndex: TEST_TEAM.leadAgent.index,
      },
    })
  })

  test("backs off for the rest of the delay after an unproductive attempt", () => {
    const attempts = { count: 2, lastAttemptAt: NOW - 1_000 }
    expect(nextAutonomyStep(gate({ attempts }))).toEqual({ kind: "wait", delayMs: 3_000 })
    expect(nextAutonomyStep(gate({ attempts, now: NOW + 3_000 }))).toEqual({ kind: "proceed" })
  })
})

describe("pauseForError", () => {
  test("pauses at once for quota and configuration errors", () => {
    expect(pauseForError("rate_limited", 3)?.kind).toBe("quota")
    expect(pauseForError("not_configured", 3)).toMatchObject({
      kind: "not_configured",
      agentIndex: 3,
    })
  })

  test("leaves transient and request errors to backoff", () => {
    for (const kind of ["unavailable", "invalid_request", "aborted", "other"] as const) {
      expect(pauseForError(kind, 3)).toBeNull()
    }
  })
})
