import type { AccessoryId } from "./characters/character-models"

/**
 * What a character does on its own: the user is driven by input, the lead never sits and
 * celebrates at its spot once the project is delivered, members wander and work.
 */
export type CastRole = "user" | "lead" | "member"

/** One character the scene draws, with its look already decided by the scene's owner. */
export interface CastMember {
  index: number
  role: CastRole
  modelId: string
  accessory: AccessoryId | null
  color: string
}

/** Who the scene draws, in roster order (the user first, then the lead first), and the office accent colour. */
export interface SceneCast {
  themeColor: string
  members: readonly CastMember[]
}

/** The user's character index. Every cast has exactly one user, so a cast without one is a programming error. */
export function userIndexOf(cast: SceneCast): number {
  const user = cast.members.find((member) => member.role === "user")
  if (!user) throw new Error("A scene cast needs a user")
  return user.index
}

/** The member drawn for this index, or undefined when it is not in the cast. */
export function castMemberAt(cast: SceneCast, index: number): CastMember | undefined {
  return cast.members.find((member) => member.index === index)
}

/** Every member except the user, in roster order. */
export function nonPlayerMembers(cast: SceneCast): CastMember[] {
  return cast.members.filter((member) => member.role !== "user")
}

/** Every model the cast uses, each once, so only those are loaded and instanced. */
export function modelIdsUsedBy(cast: SceneCast): string[] {
  return [...new Set(cast.members.map((member) => member.modelId))]
}
