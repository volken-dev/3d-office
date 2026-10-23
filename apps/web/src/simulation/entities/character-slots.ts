import type { AgenticSystem } from "@the-delegation/agents/team"
import { getAllCharacters } from "../../data/agents"

/**
 * Maps agent indices to dense instance slots. Agent indices identify characters everywhere outside
 * the scene's buffers and may have gaps, start anywhere and change when agents are removed; the
 * per-instance buffers need 0..count-1. CharacterManager owns the one mapping for the current
 * roster and translates at its public API, so nothing else ever sees a slot.
 */
export class CharacterSlots {
  /** Agent indices in slot order: the agent at slot `n` is `agentIndices[n]`. */
  public readonly agentIndices: readonly number[]
  private readonly slotByAgentIndex: ReadonlyMap<number, number>

  /** Throws when an agent index appears twice, since two characters cannot share one slot. */
  constructor(agentIndices: readonly number[]) {
    const slotByAgentIndex = new Map<number, number>()
    agentIndices.forEach((agentIndex, slot) => {
      if (slotByAgentIndex.has(agentIndex)) {
        throw new Error(`Agent index ${agentIndex} appears more than once in the roster`)
      }
      slotByAgentIndex.set(agentIndex, slot)
    })
    this.agentIndices = [...agentIndices]
    this.slotByAgentIndex = slotByAgentIndex
  }

  /** The user and every agent of the team, in roster order (user first, then lead first). */
  public static forTeam(team: AgenticSystem): CharacterSlots {
    return new CharacterSlots(getAllCharacters(team).map((character) => character.index))
  }

  public get count(): number {
    return this.agentIndices.length
  }

  /** The instance slot of an agent, or null when the agent is not in this roster. */
  public slotOf(agentIndex: number): number | null {
    return this.slotByAgentIndex.get(agentIndex) ?? null
  }

  /** The agent drawn in a slot, or null when the slot is out of range. */
  public agentIndexAt(slot: number): number | null {
    return this.agentIndices[slot] ?? null
  }
}
