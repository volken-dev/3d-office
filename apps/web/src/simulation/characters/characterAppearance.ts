import { type AgenticSystem, getAllAgents, isLeadAgent } from "@the-delegation/agents/team"
import { getAllCharacters } from "../../data/agents"
import {
  type AccessoryId,
  DEFAULT_CHARACTER_MODEL_ID,
  findCharacterModel,
  LEAD_CHARACTER_MODEL_ID,
} from "./characterModels"

/** Which model a character is drawn with, and which accessory it wears if the model has one. */
export interface CharacterAppearance {
  modelId: string
  accessory: AccessoryId | null
}

/**
 * The look of one character slot. The user is a plain human. An agent uses its own `character` when that names a
 * registered model, else the lead gets the lead model and everyone else the default; leads wear headphones and
 * team agents a cap, on models that have those parts.
 */
export function appearanceFor(team: AgenticSystem, characterIndex: number): CharacterAppearance {
  if (characterIndex === team.user.index) {
    return { modelId: DEFAULT_CHARACTER_MODEL_ID, accessory: null }
  }
  const agent = getAllAgents(team).find((candidate) => candidate.index === characterIndex)
  const isLead = isLeadAgent(team, characterIndex)
  const chosen =
    agent?.character && findCharacterModel(agent.character) ? agent.character : undefined
  return {
    modelId: chosen ?? (isLead ? LEAD_CHARACTER_MODEL_ID : DEFAULT_CHARACTER_MODEL_ID),
    accessory: isLead ? "headphones" : "cap",
  }
}

/** Every model the team's characters use, so only those are loaded and instanced. */
export function modelIdsUsedBy(team: AgenticSystem): string[] {
  const ids = new Set<string>()
  for (const character of getAllCharacters(team))
    ids.add(appearanceFor(team, character.index).modelId)
  return [...ids]
}
