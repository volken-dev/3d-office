import { type AgenticSystem, type AgentNode, MAX_AGENTS } from "@the-delegation/agents/team"
import { getAllCharacters } from "../../data/agents"

/** Colour for new teams and agents. */
export const DEFAULT_AGENT_COLOR = "#A855F7"

/** Agents plus the user. */
export const MAX_CHARACTERS = MAX_AGENTS + 1

/** Canvas spacing used to place a newly added subagent below its parent without overlapping other nodes. */
const NEW_NODE_LAYOUT = {
  verticalGap: 160,
  siblingOffsetsX: [0, -280, 280, -560, 560],
  collisionBox: { width: 200, height: 100 },
  rowStep: 130,
  maxRowShifts: 8,
} as const

type Position = { x: number; y: number }

function updateAgentInTree(node: AgentNode, id: string, changes: Partial<AgentNode>): AgentNode {
  if (node.id === id) return { ...node, ...changes }
  if (!node.subagents) return node
  return {
    ...node,
    subagents: node.subagents.map((subagent) => updateAgentInTree(subagent, id, changes)),
  }
}

function removeAgentFromTree(node: AgentNode, id: string): AgentNode | null {
  if (node.id === id) return null
  if (!node.subagents) return node
  return {
    ...node,
    subagents: node.subagents
      .map((subagent) => removeAgentFromTree(subagent, id))
      .filter((subagent): subagent is AgentNode => subagent !== null),
  }
}

/** Returns the system with one agent's fields replaced, wherever it sits in the tree. */
export function updateAgent(
  system: AgenticSystem,
  id: string,
  changes: Partial<AgentNode>,
): AgenticSystem {
  return { ...system, leadAgent: updateAgentInTree(system.leadAgent, id, changes) }
}

/** Returns the system without the agent and everything that reports to it. */
export function removeAgent(system: AgenticSystem, id: string): AgenticSystem {
  const leadAgent = removeAgentFromTree(system.leadAgent, id)
  return leadAgent ? { ...system, leadAgent } : system
}

/** Returns the system with `agent` appended under `parentId`. */
export function addSubagent(
  system: AgenticSystem,
  parentId: string,
  agent: AgentNode,
): AgenticSystem {
  const parent = getAllCharacters(system).find((character) => character.id === parentId)
  return updateAgent(system, parentId, { subagents: [...(parent?.subagents ?? []), agent] })
}

/** Number of agents below `agent` that are removed together with it. */
export function countDescendants(agent: AgentNode): number {
  return (agent.subagents ?? []).reduce((sum, subagent) => sum + 1 + countDescendants(subagent), 0)
}

/** Next free character index; `characters.length` would collide after a removal. */
export function nextAgentIndex(characters: AgentNode[]): number {
  return Math.max(0, ...characters.map((character) => character.index)) + 1
}

/** Canvas position for a new subagent: below its parent, shifted down until it overlaps nothing. */
export function placeNewSubagent(parent: AgentNode, characters: AgentNode[]): Position {
  const { verticalGap, siblingOffsetsX, collisionBox, rowStep, maxRowShifts } = NEW_NODE_LAYOUT
  const parentPosition = parent.position ?? { x: 0, y: 0 }
  const siblingCount = parent.subagents?.length ?? 0
  const position = {
    x: parentPosition.x + siblingOffsetsX[siblingCount % siblingOffsetsX.length],
    y: parentPosition.y + verticalGap,
  }

  const overlaps = (candidate: Position) =>
    characters.some(
      (character) =>
        character.position &&
        Math.abs(character.position.x - candidate.x) < collisionBox.width &&
        Math.abs(character.position.y - candidate.y) < collisionBox.height,
    )

  for (let shifts = 0; overlaps(position) && shifts < maxRowShifts; shifts++) {
    position.y += rowStep
  }
  return position
}

/** The agent fields the editor changes. Saving writes only these, so tree data (subagents, position) is never overwritten by a stale copy. */
export type AgentDraft = Pick<AgentNode, "id" | "name" | "description" | "color" | "model"> & {
  humanInTheLoop: boolean
}

const AGENT_DRAFT_KEYS = [
  "id",
  "name",
  "description",
  "color",
  "model",
  "humanInTheLoop",
] as const satisfies readonly (keyof AgentDraft)[]

/** The editable copy of an agent the panel works on until the user saves. */
export function agentDraftOf(agent: AgentNode): AgentDraft {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    color: agent.color,
    model: agent.model,
    humanInTheLoop: !!agent.humanInTheLoop,
  }
}

/** Whether saving the draft would change the agent; drives the discard-changes guard. */
export function isAgentDraftDirty(draft: AgentDraft, agent: AgentNode): boolean {
  const saved = agentDraftOf(agent)
  return AGENT_DRAFT_KEYS.some((key) => draft[key] !== saved[key])
}

/** Which unsaved drafts an action would throw away. */
export type DiscardScope = "agent" | "team" | "all"
/** Runs an action now, or after the user confirms discarding the drafts in `scope`. */
export type RequestDiscard = (action: () => void, scope?: DiscardScope) => void
