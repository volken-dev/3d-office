import { describe, expect, test } from "bun:test"
import type { AgentStates } from "../src/office-extras"
import { poiKind, resolveSlot } from "../src/poi-slots"

describe("poiKind", () => {
  test("strips the prefix and the id", () => {
    expect(poiKind("poi-sit_work-3")).toBe("sit_work")
    expect(poiKind("poi-charge-10")).toBe("charge")
    expect(poiKind("poi-idle-spawn-1")).toBe("idle-spawn")
  })

  test("groups generated and area spots", () => {
    expect(poiKind("poi-stand-lounge-2")).toBe("stand-*")
    expect(poiKind("poi-idle-area-hub")).toBe("idle-area")
    expect(poiKind("poi-idle-area-server_room")).toBe("idle-area")
  })
})

const POI_NAMES = [
  "poi-sit_work-1",
  "poi-sit_work-2",
  "poi-ship-1",
  "poi-ship-2",
  "poi-ship-3",
  "poi-stand-deploy-1",
  "poi-stand-deploy-2",
  "poi-stand-entry-1",
  "poi-stand-entry-2",
]

const STATES: AgentStates = {
  working: {
    color: "green",
    slots: [{ pois: ["poi-sit_work-*"], clip: "Sit_Work", assign: "own" }],
  },
  shipping: {
    color: "green",
    slots: [
      { pois: ["poi-ship-1", "poi-ship-3"], clip: "Hammer" },
      { pois: ["poi-ship-2"], clip: "Tinker" },
      { pois: ["poi-stand-deploy-*"], clip: "LookAround" },
    ],
  },
  queued: {
    color: "yellow",
    slots: [{ pois: ["poi-stand-entry-*"], clip: "LookAround", assign: "position" }],
  },
}

describe("resolveSlot", () => {
  test("fills slots and their POIs in order, skipping taken ones", () => {
    const taken = new Set<string>()
    const picks: string[] = []
    for (let pick = 0; pick < 5; pick++) {
      const slot = resolveSlot(STATES, "shipping", 1, taken, POI_NAMES)
      if (!slot) throw new Error("expected a slot")
      picks.push(`${slot.poi}:${slot.clip}`)
      taken.add(slot.poi)
    }
    expect(picks).toEqual([
      "poi-ship-1:Hammer",
      "poi-ship-3:Hammer",
      "poi-ship-2:Tinker",
      "poi-stand-deploy-1:LookAround",
      "poi-stand-deploy-2:LookAround",
    ])
    expect(resolveSlot(STATES, "shipping", 1, taken, POI_NAMES)).toBeNull()
  })

  test("a wildcard matches one name segment only", () => {
    const states: AgentStates = {
      idle: { color: "yellow", slots: [{ pois: ["poi-stand-*"], clip: "Idle" }] },
    }
    expect(resolveSlot(states, "idle", 1, new Set(), POI_NAMES)).toBeNull()
  })

  test("own resolves to the agent's own POI and nothing else", () => {
    expect(resolveSlot(STATES, "working", 2, new Set(), POI_NAMES)).toEqual({
      poi: "poi-sit_work-2",
      clip: "Sit_Work",
    })
    expect(resolveSlot(STATES, "working", 2, new Set(["poi-sit_work-2"]), POI_NAMES)).toBeNull()
    expect(resolveSlot(STATES, "working", 7, new Set(), POI_NAMES)).toBeNull()
  })

  test("position resolves by queue position", () => {
    expect(resolveSlot(STATES, "queued", 2, new Set(), POI_NAMES)?.poi).toBe("poi-stand-entry-2")
    expect(resolveSlot(STATES, "queued", 3, new Set(), POI_NAMES)).toBeNull()
  })

  test("an unknown state resolves to nothing", () => {
    expect(resolveSlot(STATES, "dancing", 1, new Set(), POI_NAMES)).toBeNull()
    expect(resolveSlot(STATES, "constructor", 1, new Set(), POI_NAMES)).toBeNull()
  })
})
