import { describe, expect, test } from "bun:test"
import { OfficeAgent, RETRY_INTERVAL } from "../src/agent"
import type { OfficeWorld } from "../src/office-world"
import { FakeActor } from "./support/fake-actor"
import { tinyWorld } from "./support/tiny-office"

const FRAME = 1 / 30

function spawnAgent(world: OfficeWorld, desk: number, spawn = "poi-idle-spawn-1") {
  const actor = new FakeActor()
  const agent = new OfficeAgent({ id: desk, desk, actor, world })
  const [x, z] = world.approachOf(spawn)
  agent.spawnAt(x, z)
  return { agent, actor }
}

function step(agents: readonly OfficeAgent[], seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    for (const agent of agents) agent.update(FRAME)
  }
}

function settle(agents: readonly OfficeAgent[], budgetSeconds = 60): number {
  let elapsed = 0
  while (elapsed < budgetSeconds) {
    for (const agent of agents) agent.update(FRAME)
    elapsed += FRAME
    if (agents.every((agent) => agent.settled)) return elapsed
  }
  throw new Error(`agents did not settle within ${budgetSeconds} s`)
}

function stepUntil(agent: OfficeAgent, condition: () => boolean, budgetSeconds = 60): void {
  let elapsed = 0
  while (!condition()) {
    if (elapsed > budgetSeconds) throw new Error("condition never held")
    agent.update(FRAME)
    elapsed += FRAME
  }
}

describe("OfficeAgent", () => {
  test("walks, turns, sits and loops the state clip at its own desk", () => {
    const world = tinyWorld()
    const { agent, actor } = spawnAgent(world, 1)
    expect(agent.settled).toBe(true)
    agent.setState("working")
    expect(agent.poi).toBe("poi-sit_work-1")
    expect(world.taken.has("poi-sit_work-1")).toBe(true)
    expect(agent.stepKind).toBe("walk")
    expect(agent.busy).toBe(true)
    expect(agent.path).not.toBeNull()
    settle([agent])
    expect(actor.clips).toEqual(["Idle", "Walk", "Idle", "Sit", "Sit_Work"])
    expect(actor.plays.find((played) => played.clip === "Sit")?.options.once).toBe(true)
    expect(agent.path).toBeNull()
    expect(agent.x).toBeCloseTo(1.5, 6)
    expect(agent.z).toBeCloseTo(1.5, 6)
    expect(agent.yaw).toBeCloseTo(0, 6)
    expect(actor.x).toBe(agent.x)
    expect(agent.state).toBe("working")
    expect(agent.clip).toBe("Sit_Work")
  })

  test("stands up and unplugs through the contract's clips, keeping the seat until it is up", () => {
    const world = tinyWorld()
    const { agent, actor } = spawnAgent(world, 1)
    agent.setState("paused_or_rate_limited")
    settle([agent])
    expect(actor.clips.slice(-3)).toEqual(["Sit", "Plug_In", "Charge"])
    expect(agent.x).toBeCloseTo(10.5, 6)

    agent.setState("working")
    expect(agent.poi).toBe("poi-sit_work-1")
    expect(agent.stepKind).toBe("exit")
    expect(world.taken.has("poi-charge-1")).toBe(true)
    stepUntil(agent, () => agent.stepKind === "walk")
    expect(world.taken.has("poi-charge-1")).toBe(false)
    expect(agent.x).toBeCloseTo(9.5, 6)
    settle([agent])
    expect(actor.clips.slice(-6)).toEqual(["Plug_Out", "Stand", "Walk", "Idle", "Sit", "Sit_Work"])
  })

  test("changes clip in place when the new state uses the same seat", () => {
    const world = tinyWorld()
    const { agent, actor } = spawnAgent(world, 2)
    agent.setState("working")
    settle([agent])
    const playsBefore = actor.plays.length
    agent.setState("waiting_for_input")
    expect(agent.settled).toBe(true)
    expect(actor.clips.slice(playsBefore)).toEqual(["Sit_Wait"])
    expect(agent.poi).toBe("poi-sit_work-2")
  })

  test("finishes standing up before acting on a newer state", () => {
    const world = tinyWorld()
    const { agent } = spawnAgent(world, 1)
    agent.setState("working")
    settle([agent])
    agent.setState("shipping")
    expect(agent.stepKind).toBe("exit")
    agent.setState("paused_or_rate_limited")
    expect(agent.stepKind).toBe("exit")
    expect(agent.state).toBe("shipping")
    stepUntil(agent, () => agent.stepKind !== "exit")
    expect(agent.state).toBe("paused_or_rate_limited")
    expect(agent.poi).toBe("poi-charge-1")
    expect(world.taken.has("poi-ship-1")).toBe(false)
    expect(world.taken.has("poi-sit_work-1")).toBe(false)
    settle([agent])
    expect(agent.clip).toBe("Charge")
  })

  test("finishes sitting down before leaving again", () => {
    const world = tinyWorld()
    const { agent, actor } = spawnAgent(world, 1)
    agent.setState("working")
    stepUntil(agent, () => agent.stepKind === "enter")
    agent.setState("shipping")
    expect(agent.stepKind).toBe("enter")
    expect(agent.poi).toBe("poi-sit_work-1")
    settle([agent])
    expect(agent.poi).toBe("poi-ship-1")
    expect(actor.clips.slice(-6)).toEqual(["Sit", "Sit_Work", "Stand", "Walk", "Idle", "Hammer"])
  })

  test("re-targets mid-walk and frees the POI it was heading for", () => {
    const world = tinyWorld()
    const { agent, actor } = spawnAgent(world, 1)
    agent.setState("working")
    step([agent], 1)
    expect(agent.stepKind).toBe("walk")
    agent.setState("shipping")
    expect(agent.poi).toBe("poi-ship-1")
    expect(world.taken.has("poi-sit_work-1")).toBe(false)
    expect(agent.stepKind).toBe("walk")
    settle([agent])
    expect(actor.clips).not.toContain("Sit")
    expect(agent.clip).toBe("Hammer")
    expect(agent.x).toBeCloseTo(8.5, 6)
  })

  test("two agents never take the same POI; one waits and retries until it frees", () => {
    const world = tinyWorld()
    const first = spawnAgent(world, 1).agent
    const second = spawnAgent(world, 2, "poi-idle-spawn-2").agent
    first.setState("shipping")
    second.setState("shipping")
    expect(first.poi).toBe("poi-ship-1")
    expect(second.poi).toBeNull()
    expect(second.state).toBe("shipping")
    expect(second.settled).toBe(false)
    step([first, second], RETRY_INTERVAL * 3)
    expect(second.poi).toBeNull()
    expect(second.settled).toBe(false)

    first.setState("working")
    expect(world.taken.has("poi-ship-1")).toBe(false)
    step([first, second], RETRY_INTERVAL + FRAME * 2)
    expect(second.poi).toBe("poi-ship-1")
    settle([first, second])
    expect(second.clip).toBe("Hammer")
    expect(first.poi).toBe("poi-sit_work-1")
  })

  test("fills a state's slots in order across agents", () => {
    const world = tinyWorld()
    const agents = [1, 2, 3].map((desk) => spawnAgent(world, desk).agent)
    for (const agent of agents) agent.setState("arrive")
    expect(agents.map((agent) => agent.poi)).toEqual([
      "poi-idle-spawn-1",
      "poi-idle-spawn-2",
      "poi-stand-entry-1",
    ])
    settle(agents)
    expect(agents.every((agent) => agent.clip === "Wave")).toBe(true)
  })

  test("setDesk re-targets the current state, as the queue moving up", () => {
    const world = tinyWorld()
    const { agent } = spawnAgent(world, 2)
    agent.setState("queued")
    settle([agent])
    expect(agent.poi).toBe("poi-stand-entry-2")
    agent.setDesk(1)
    expect(agent.poi).toBe("poi-stand-entry-1")
    expect(world.taken.has("poi-stand-entry-2")).toBe(false)
    settle([agent])
    expect(agent.x).toBeCloseTo(4.5, 6)
    agent.setDesk(1)
    expect(agent.settled).toBe(true)
  })

  test("setDesk before any state only records the desk", () => {
    const world = tinyWorld()
    const { agent } = spawnAgent(world, 2)
    agent.setDesk(1)
    expect(agent.desk).toBe(1)
    expect(agent.poi).toBeNull()
    expect(agent.settled).toBe(true)
  })

  test("place puts an agent straight on its POI, and refuses a taken one", () => {
    const world = tinyWorld()
    const actor = new FakeActor()
    const agent = new OfficeAgent({ id: "a", desk: 2, actor, world })
    expect(agent.place("paused_or_rate_limited")).toBe(true)
    expect([agent.x, agent.z, agent.yaw]).toEqual([10.5, 3.5, Math.PI])
    expect(actor.plays).toEqual([{ clip: "Charge", options: { fade: 0 } }])
    expect(agent.settled).toBe(true)
    const rival = new OfficeAgent({ id: "b", desk: 2, actor: new FakeActor(), world })
    expect(rival.place("paused_or_rate_limited")).toBe(false)
    expect(rival.poi).toBeNull()
  })

  test("release frees every POI the agent holds", () => {
    const world = tinyWorld()
    const { agent } = spawnAgent(world, 1)
    agent.setState("working")
    settle([agent])
    agent.setState("shipping")
    expect([...world.taken].sort()).toEqual(["poi-ship-1", "poi-sit_work-1"])
    agent.release()
    expect(world.taken.size).toBe(0)
  })

  test("an unknown state leaves the agent where it is, retrying", () => {
    const world = tinyWorld()
    const { agent } = spawnAgent(world, 1)
    agent.setState("dancing")
    expect(agent.poi).toBeNull()
    expect(agent.settled).toBe(false)
    expect(agent.stepKind).toBe("loop")
  })
})
