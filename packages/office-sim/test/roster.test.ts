import { describe, expect, test } from "bun:test"
import { Roster } from "../src/roster"

describe("Roster", () => {
  test("seats sessions in the lowest free slot, then queues them", () => {
    const roster = new Roster<string>(2)
    expect(roster.join("a")).toBe(1)
    expect(roster.join("b")).toBe(2)
    expect(roster.join("c")).toBeNull()
    expect(roster.join("d")).toBeNull()
    expect(roster.position("c")).toBe(1)
    expect(roster.position("d")).toBe(2)
    expect(roster.queued).toEqual(["c", "d"])
    expect(roster.join("a")).toBe(1)
    expect(roster.join("c")).toBeNull()
    expect(roster.queued).toEqual(["c", "d"])
  })

  test("honours a requested slot when it is free", () => {
    const roster = new Roster<string>(3)
    expect(roster.join("a", 3)).toBe(3)
    expect(roster.join("b", 3)).toBe(1)
    expect(roster.isTaken(3)).toBe(true)
    expect(roster.firstFree()).toBe(2)
  })

  test("promotes the head of the queue into a freed slot and moves the rest up", () => {
    const roster = new Roster<string>(2)
    for (const session of ["a", "b", "c", "d"]) roster.join(session)
    expect(roster.leave("a")).toEqual({ promoted: "c", slot: 1 })
    expect(roster.slotOf("c")).toBe(1)
    expect(roster.position("c")).toBeNull()
    expect(roster.position("d")).toBe(1)
    expect(roster.slotOf("a")).toBeNull()
  })

  test("a queued session leaving just drops out of the queue", () => {
    const roster = new Roster<string>(1)
    for (const session of ["a", "b", "c"]) roster.join(session)
    expect(roster.leave("b")).toBeNull()
    expect(roster.queued).toEqual(["c"])
    expect(roster.leave("a")).toEqual({ promoted: "c", slot: 1 })
    expect(roster.leave("c")).toBeNull()
    expect(roster.firstFree()).toBe(1)
  })

  test("refuses a non-positive size", () => {
    expect(() => new Roster<string>(0)).toThrow()
  })
})
