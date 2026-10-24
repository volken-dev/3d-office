import { describe, expect, test } from "bun:test"
import type { AgentState } from "../../src/data/agent-states"
import {
  type AgentStateChange,
  createLiveDemo,
  LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS,
  LIVE_DEMO_ARRIVE_HOLD_SECONDS,
  LIVE_DEMO_MAX_HOLD_SECONDS,
  LIVE_DEMO_MIN_HOLD_SECONDS,
} from "../../src/integration/live-demo"

const AGENT_INDICES = [1, 2, 3, 4, 5]
const STEP_SECONDS = 0.25

/** Mulberry32: a small seeded generator, so every run sees the same sequence. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

interface TimedChange extends AgentStateChange {
  atSeconds: number
}

function runDemo(seed: number, durationSeconds: number): TimedChange[] {
  const demo = createLiveDemo({ agentIndices: AGENT_INDICES, random: seededRandom(seed) })
  const changes: TimedChange[] = []
  for (let step = 0; step * STEP_SECONDS <= durationSeconds; step++) {
    const atSeconds = step * STEP_SECONDS
    for (const change of demo.update(atSeconds)) changes.push({ ...change, atSeconds })
  }
  return changes
}

function changesFor(changes: TimedChange[], agentIndex: number): TimedChange[] {
  return changes.filter((change) => change.agentIndex === agentIndex)
}

describe("createLiveDemo", () => {
  test("agents arrive one at a time, in cast order, an arrival interval apart", () => {
    const demo = createLiveDemo({ agentIndices: AGENT_INDICES, random: seededRandom(1) })
    expect(demo.update(0)).toEqual([{ agentIndex: 1, state: "arrive" }])
    expect(demo.update(1)).toEqual([])
    const arrivals = runDemo(1, 30).filter((change) => change.state === "arrive")
    expect(arrivals.map((change) => change.agentIndex)).toEqual(AGENT_INDICES)
    expect(arrivals.map((change) => change.atSeconds)).toEqual(
      AGENT_INDICES.map((_, castOrder) => castOrder * LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS),
    )
  })

  test("each agent waves at the door before its first demo state", () => {
    const changes = runDemo(2, 60)
    for (const agentIndex of AGENT_INDICES) {
      const [arrival, firstState] = changesFor(changes, agentIndex)
      if (!arrival || !firstState) throw new Error("missing change")
      expect(firstState.atSeconds - arrival.atSeconds).toBe(LIVE_DEMO_ARRIVE_HOLD_SECONDS)
    }
  })

  test("each agent holds a state for 8 to 20 s", () => {
    const changes = runDemo(7, 600)
    for (const agentIndex of AGENT_INDICES) {
      const agentChanges = changesFor(changes, agentIndex)
      expect(agentChanges.length).toBeGreaterThan(20)
      for (let changeIndex = 2; changeIndex < agentChanges.length; changeIndex++) {
        const previous = agentChanges[changeIndex - 1]
        const current = agentChanges[changeIndex]
        if (!previous || !current) throw new Error("missing change")
        const holdSeconds = current.atSeconds - previous.atSeconds
        expect(holdSeconds).toBeGreaterThanOrEqual(LIVE_DEMO_MIN_HOLD_SECONDS)
        expect(holdSeconds).toBeLessThanOrEqual(LIVE_DEMO_MAX_HOLD_SECONDS + STEP_SECONDS)
      }
    }
  })

  test("never picks queued or arrive again, and never repeats a state", () => {
    const changes = runDemo(11, 3600)
    for (const agentIndex of AGENT_INDICES) {
      const states = changesFor(changes, agentIndex).map((change) => change.state)
      expect(states[0]).toBe("arrive")
      expect(states.slice(1)).not.toContain("arrive")
      expect(states).not.toContain("queued")
      for (let stateIndex = 1; stateIndex < states.length; stateIndex++) {
        expect(states[stateIndex]).not.toBe(states[stateIndex - 1])
      }
    }
  })

  test("weights working and shipping above error", () => {
    const counts = new Map<AgentState, number>()
    for (const change of runDemo(3, 36_000)) {
      counts.set(change.state, (counts.get(change.state) ?? 0) + 1)
    }
    const countOf = (state: AgentState) => counts.get(state) ?? 0
    expect(countOf("working")).toBeGreaterThan(countOf("idle"))
    expect(countOf("shipping")).toBeGreaterThan(countOf("done"))
    expect(countOf("error")).toBeLessThan(countOf("waiting_for_input"))
    expect(countOf("error")).toBeGreaterThan(0)
  })

  test("staggers the agents rather than changing them together", () => {
    const changes = runDemo(5, 120).filter((change) => change.state !== "arrive")
    const firstChangeTimes = AGENT_INDICES.map(
      (agentIndex) => changesFor(changes, agentIndex)[0]?.atSeconds,
    )
    expect(new Set(firstChangeTimes).size).toBeGreaterThan(1)
  })

  test("is deterministic for a seed", () => {
    expect(runDemo(42, 300)).toEqual(runDemo(42, 300))
    expect(runDemo(42, 300)).not.toEqual(runDemo(43, 300))
  })

  test("a late update changes each arrived agent once and brings in one more, without a burst", () => {
    const demo = createLiveDemo({ agentIndices: AGENT_INDICES, random: seededRandom(9) })
    demo.update(0)
    const lateChanges = demo.update(600)
    expect(lateChanges).toEqual([
      { agentIndex: 1, state: expect.any(String) },
      { agentIndex: 2, state: "arrive" },
    ])
    expect(demo.update(600 + 1)).toEqual([])
    expect(demo.update(600 + LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS)).toContainEqual({
      agentIndex: 3,
      state: "arrive",
    })
  })
})
