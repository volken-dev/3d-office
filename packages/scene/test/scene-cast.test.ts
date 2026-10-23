import { describe, expect, test } from "bun:test"
import { castMemberAt, modelIdsUsedBy, nonPlayerMembers, userIndexOf } from "../src/scene-cast"
import { castOf } from "./support/cast"

describe("scene cast helpers", () => {
  test("find the user, the non-player members and a member by index", () => {
    const cast = castOf(5, [7, 3, 9])
    expect(userIndexOf(cast)).toBe(5)
    expect(nonPlayerMembers(cast).map((member) => member.index)).toEqual([7, 3, 9])
    expect(castMemberAt(cast, 3)?.role).toBe("member")
    expect(castMemberAt(cast, 0)).toBeUndefined()
  })

  test("a cast without a user is rejected", () => {
    expect(() => userIndexOf({ themeColor: "#000000", members: [] })).toThrow("needs a user")
  })

  test("modelIdsUsedBy lists each model once", () => {
    const cast = castOf(0, [1, 2])
    const withRobot = {
      ...cast,
      members: cast.members.map((member) =>
        member.role === "lead" ? { ...member, modelId: "robot" } : member,
      ),
    }
    expect(modelIdsUsedBy(cast)).toEqual(["human"])
    expect(modelIdsUsedBy(withRobot).sort()).toEqual(["human", "robot"])
  })
})
