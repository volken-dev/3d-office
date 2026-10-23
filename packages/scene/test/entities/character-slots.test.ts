import { describe, expect, test } from "bun:test"
import { CharacterSlots } from "../../../src/simulation/entities/character-slots"
import { castOf } from "../../support/cast"

describe("CharacterSlots", () => {
  test("gives the user and every agent a dense slot in roster order", () => {
    const slots = CharacterSlots.forCast(castOf(0, [1, 2, 3]))
    expect(slots.count).toBe(4)
    expect(slots.agentIndices).toEqual([0, 1, 2, 3])
    expect(slots.slotOf(0)).toBe(0)
    expect(slots.slotOf(3)).toBe(3)
  })

  test("keeps slots dense when an agent in the middle was removed", () => {
    const slots = CharacterSlots.forCast(castOf(0, [1, 2, 4, 5]))
    expect(slots.count).toBe(5)
    expect(slots.slotOf(4)).toBe(3)
    expect(slots.slotOf(5)).toBe(4)
    expect(slots.slotOf(3)).toBeNull()
    expect(slots.agentIndexAt(4)).toBe(5)
  })

  test("does not assume the user is index 0 or that indices are ordered", () => {
    const slots = CharacterSlots.forCast(castOf(5, [7, 3, 9]))
    expect(slots.agentIndices).toEqual([5, 7, 3, 9])
    expect(slots.slotOf(5)).toBe(0)
    expect(slots.slotOf(9)).toBe(3)
    expect(slots.slotOf(0)).toBeNull()
    expect(slots.agentIndexAt(4)).toBeNull()
  })

  test("rejects a roster where two characters share an index", () => {
    expect(() => new CharacterSlots([0, 1, 1])).toThrow("appears more than once")
  })
})
