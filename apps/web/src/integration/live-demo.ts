import type { AgentState } from "../data/agent-states"

/**
 * How often the live demo picks each state, relative to the others: robots spend most of the demo
 * working and shipping, pause or idle sometimes, wait for input or finish less, and fail rarely.
 * `arrive` is only the entrance and `queued` is never picked.
 */
export const LIVE_DEMO_STATE_WEIGHTS = {
  working: 6,
  shipping: 5,
  idle: 2,
  paused_or_rate_limited: 2,
  waiting_for_input: 1,
  done: 1,
  error: 0.5,
} as const satisfies Partial<Record<AgentState, number>>

/** Each robot holds a demo state for a uniform random time in this range before the next one. */
export const LIVE_DEMO_MIN_HOLD_SECONDS = 8
export const LIVE_DEMO_MAX_HOLD_SECONDS = 20

/**
 * Seconds between robots walking in. The office's spawn points are closer together than a robot
 * is wide, so robots come in one at a time and each has left the door before the next arrives.
 */
export const LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS = 4

/** Seconds a robot waves at the door after arriving before it heads for its first state. */
export const LIVE_DEMO_ARRIVE_HOLD_SECONDS = 3

const DEFAULT_TICK_INTERVAL_MS = 1000

type DemoState = keyof typeof LIVE_DEMO_STATE_WEIGHTS

const DEMO_STATES: readonly DemoState[] = [
  "working",
  "shipping",
  "idle",
  "paused_or_rate_limited",
  "waiting_for_input",
  "done",
  "error",
]

/** One state change the live demo asks the scene to show. */
export interface AgentStateChange {
  agentIndex: number
  state: AgentState
}

/** The live demo scheduler: feed it the time since it started, apply what it returns. */
export interface LiveDemo {
  update(elapsedSeconds: number): AgentStateChange[]
}

interface LiveDemoOptions {
  agentIndices: readonly number[]
  /** A uniform random number in [0, 1); seed it for a reproducible demo. */
  random: () => number
}

interface AgentSchedule {
  agentIndex: number
  /** Null until the robot has arrived. */
  state: AgentState | null
  nextChangeAtSeconds: number
}

function randomHoldSeconds(random: () => number): number {
  return (
    LIVE_DEMO_MIN_HOLD_SECONDS +
    random() * (LIVE_DEMO_MAX_HOLD_SECONDS - LIVE_DEMO_MIN_HOLD_SECONDS)
  )
}

function pickNextState(currentState: AgentState | null, random: () => number): DemoState {
  const candidates = DEMO_STATES.filter((state) => state !== currentState)
  const totalWeight = candidates.reduce((sum, state) => sum + LIVE_DEMO_STATE_WEIGHTS[state], 0)
  let remaining = random() * totalWeight
  for (const state of candidates) {
    remaining -= LIVE_DEMO_STATE_WEIGHTS[state]
    if (remaining < 0) return state
  }
  return candidates[candidates.length - 1] ?? "working"
}

/**
 * A pure scheduler for the office's demo. Robots arrive one at a time, in cast order, every
 * `LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS` from the first update; each waves for
 * `LIVE_DEMO_ARRIVE_HOLD_SECONDS`, then on its own random clock moves to a weighted pick of the
 * other demo states every 8 to 20 s. An `arrive` change is the host's cue to add the robot to the
 * scene. It keeps no timers, so tests drive it with any clock; a real agent product replaces it
 * without touching the scene. A late update (a throttled background tab) brings in at most one
 * robot and changes each robot at most once, scheduling from the missed time, or from now when a
 * whole hold was missed, so a returning tab gets no burst of changes or a crowd at the door.
 */
export function createLiveDemo({ agentIndices, random }: LiveDemoOptions): LiveDemo {
  let schedules: AgentSchedule[] | null = null

  return {
    update(elapsedSeconds) {
      if (!schedules) {
        schedules = agentIndices.map((agentIndex, castOrder) => ({
          agentIndex,
          state: null,
          nextChangeAtSeconds: elapsedSeconds + castOrder * LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS,
        }))
      }
      const changes: AgentStateChange[] = []
      let hasArrivedThisUpdate = false
      for (const schedule of schedules) {
        if (elapsedSeconds < schedule.nextChangeAtSeconds) continue
        if (schedule.state === null) {
          if (hasArrivedThisUpdate) {
            schedule.nextChangeAtSeconds = elapsedSeconds + LIVE_DEMO_ARRIVAL_INTERVAL_SECONDS
            continue
          }
          hasArrivedThisUpdate = true
          schedule.state = "arrive"
          schedule.nextChangeAtSeconds = elapsedSeconds + LIVE_DEMO_ARRIVE_HOLD_SECONDS
          changes.push({ agentIndex: schedule.agentIndex, state: schedule.state })
          continue
        }
        schedule.state = pickNextState(schedule.state, random)
        const nextFromDue = schedule.nextChangeAtSeconds + randomHoldSeconds(random)
        schedule.nextChangeAtSeconds =
          nextFromDue > elapsedSeconds ? nextFromDue : elapsedSeconds + randomHoldSeconds(random)
        changes.push({ agentIndex: schedule.agentIndex, state: schedule.state })
      }
      return changes
    },
  }
}

interface StartLiveDemoOptions {
  agentIndices: readonly number[]
  onStateChange: (change: AgentStateChange) => void
  random?: () => number
  intervalMs?: number
}

/**
 * Runs the live demo on a timer: the first robot arrives straight away, then the scheduler is
 * ticked every `intervalMs` (1 s by default). Returns the function that stops it.
 */
export function startLiveDemo({
  agentIndices,
  onStateChange,
  random = Math.random,
  intervalMs = DEFAULT_TICK_INTERVAL_MS,
}: StartLiveDemoOptions): () => void {
  const demo = createLiveDemo({ agentIndices, random })
  const startedAt = performance.now()
  const tick = () => {
    const elapsedSeconds = (performance.now() - startedAt) / 1000
    for (const change of demo.update(elapsedSeconds)) onStateChange(change)
  }
  tick()
  const intervalId = setInterval(tick, intervalMs)
  return () => clearInterval(intervalId)
}
