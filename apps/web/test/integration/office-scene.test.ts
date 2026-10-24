import { describe, expect, test } from "bun:test"
import { PLAYER_INDEX } from "../../src/data/office-cast"
import { followTargetForClick } from "../../src/integration/office-scene"

describe("followTargetForClick", () => {
  test("follows a clicked NPC", () => {
    expect(followTargetForClick(3)).toBe(3)
  })

  test("returns to the player on empty space or the player's own character", () => {
    expect(followTargetForClick(null)).toBeNull()
    expect(followTargetForClick(PLAYER_INDEX)).toBeNull()
  })
})
