import {
  DEFAULT_CHARACTER_MODEL_ID,
  LEAD_CHARACTER_MODEL_ID,
} from "@the-delegation/scene/characters/character-models"
import type { CastMember, SceneCast } from "@the-delegation/scene/scene-cast"
import { USER_COLOR } from "../theme/brand"

/** The player's character index; spawns and desks in the office GLB are numbered from it. */
export const PLAYER_INDEX = 0

const OFFICE_THEME_COLOR = "#4285F4"
const MEMBER_COLORS = ["#A142F4", "#FBBC05", "#34A853", "#EA4335"] as const

/**
 * Who is in the office: the player, a lead (the robot with headphones, who never sits) and four
 * members in caps who wander, sit and idle on their own. The looks are the ones the default team
 * had, so the office reads the same as before the agents were removed.
 */
export const OFFICE_CAST: SceneCast = {
  themeColor: OFFICE_THEME_COLOR,
  members: [
    {
      index: PLAYER_INDEX,
      role: "user",
      modelId: DEFAULT_CHARACTER_MODEL_ID,
      accessory: null,
      color: USER_COLOR,
    },
    {
      index: 1,
      role: "lead",
      modelId: LEAD_CHARACTER_MODEL_ID,
      accessory: "headphones",
      color: OFFICE_THEME_COLOR,
    },
    ...MEMBER_COLORS.map(
      (color, memberSlot): CastMember => ({
        index: memberSlot + 2,
        role: "member",
        modelId: DEFAULT_CHARACTER_MODEL_ID,
        accessory: "cap",
        color,
      }),
    ),
  ],
}
