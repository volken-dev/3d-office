import { type AgenticSystem, isLeadAgent } from "@the-delegation/agents/team"
import {
  DEFAULT_CHARACTER_MODEL_ID,
  findCharacterModel,
  LEAD_CHARACTER_MODEL_ID,
} from "@the-delegation/scene/characters/character-models"
import type { CastMember, SceneCast } from "@the-delegation/scene/scene-cast"
import { getAllCharacters } from "../data/agents"

/**
 * The scene's cast for a team: the user, then every agent, lead first. The user is a plain human.
 * An agent uses its own `character` when that names a registered model, else the lead gets the
 * lead model and everyone else the default; leads wear headphones and team agents a cap, on
 * models that have those parts.
 */
export function castForTeam(team: AgenticSystem): SceneCast {
  const members = getAllCharacters(team).map((character): CastMember => {
    if (character.index === team.user.index) {
      return {
        index: character.index,
        role: "user",
        modelId: DEFAULT_CHARACTER_MODEL_ID,
        accessory: null,
        color: character.color,
      }
    }
    const isLead = isLeadAgent(team, character.index)
    const chosenModel =
      character.character && findCharacterModel(character.character)
        ? character.character
        : undefined
    return {
      index: character.index,
      role: isLead ? "lead" : "member",
      modelId: chosenModel ?? (isLead ? LEAD_CHARACTER_MODEL_ID : DEFAULT_CHARACTER_MODEL_ID),
      accessory: isLead ? "headphones" : "cap",
      color: character.color,
    }
  })
  return { themeColor: team.color, members }
}
