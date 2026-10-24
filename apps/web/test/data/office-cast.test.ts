import { describe, expect, test } from "bun:test"
import { findCharacterModel } from "@the-delegation/scene/characters/character-models"
import { nonPlayerMembers, userIndexOf } from "@the-delegation/scene/scene-cast"
import { OFFICE_CAST, PLAYER_INDEX } from "../../src/data/office-cast"

describe("OFFICE_CAST", () => {
  test("has the player first, then a lead and four members in unique slots", () => {
    expect(userIndexOf(OFFICE_CAST)).toBe(PLAYER_INDEX)
    expect(OFFICE_CAST.members.map((member) => member.role)).toEqual([
      "user",
      "lead",
      "member",
      "member",
      "member",
      "member",
    ])
    const indices = OFFICE_CAST.members.map((member) => member.index)
    expect(new Set(indices).size).toBe(indices.length)
  })

  test("NPCs use slots 1 to 5, the spawns and desks the office test checks for", () => {
    for (const member of nonPlayerMembers(OFFICE_CAST)) {
      expect(member.index).toBeGreaterThanOrEqual(1)
      expect(member.index).toBeLessThanOrEqual(5)
    }
  })

  test("every character uses a registered model", () => {
    for (const member of OFFICE_CAST.members)
      expect(findCharacterModel(member.modelId)).toBeDefined()
  })

  test("the lead wears headphones and members wear caps", () => {
    const [lead, ...members] = nonPlayerMembers(OFFICE_CAST)
    expect(lead.accessory).toBe("headphones")
    for (const member of members) expect(member.accessory).toBe("cap")
  })
})
