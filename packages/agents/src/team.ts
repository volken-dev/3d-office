export const USER_ID = "user"
export const USER_NAME = "User"
export const MAX_AGENTS = 5

export interface AgentNode {
  id: string
  index: number
  name: string
  description: string
  color: string
  model: string
  humanInTheLoop?: boolean
  position?: { x: number; y: number }
  /** Id of the 3D character model this agent is drawn with; the scene picks a default when unset or unknown. */
  character?: string
  subagents?: AgentNode[]
}

export interface AgenticSystem {
  id: string
  teamName: string
  teamType: string
  teamDescription: string
  color: string
  outputAutoApprove?: boolean
  user: {
    index: number
    model: string
    position?: { x: number; y: number }
  }
  leadAgent: AgentNode
}

/** Every AI agent in the team, depth-first from the lead. */
export function getAllAgents(system: AgenticSystem): AgentNode[] {
  const agents: AgentNode[] = []
  function traverse(node: AgentNode): void {
    agents.push(node)
    for (const subagent of node.subagents ?? []) traverse(subagent)
  }
  traverse(system.leadAgent)
  return agents
}

export interface AgentRoster {
  /** AI agents, lead first. */
  agents: readonly AgentNode[]
  /** AI agents by index; the user is not in it. */
  byIndex: ReadonlyMap<number, AgentNode>
}

const rosterCache = new WeakMap<AgenticSystem, AgentRoster>()

/** Memoized agent list and index lookup. Systems are immutable store values, so caching per object is safe. */
export function getAgentRoster(system: AgenticSystem): AgentRoster {
  let roster = rosterCache.get(system)
  if (!roster) {
    const agents = getAllAgents(system)
    roster = { agents, byIndex: new Map(agents.map((agent) => [agent.index, agent])) }
    rosterCache.set(system, roster)
  }
  return roster
}

/**
 * Whether two versions of a team have the same agents in the same slots. A different roster needs
 * new agent runtimes and characters; the same roster with edited agents is updated in place.
 */
export function hasSameRoster(previous: AgenticSystem, next: AgenticSystem): boolean {
  const indicesOf = (system: AgenticSystem) =>
    getAllAgents(system)
      .map((agent) => agent.index)
      .join(",")
  return previous.id === next.id && indicesOf(previous) === indicesOf(next)
}

/** Whether this index is the team's lead, which alone may set the brief and deliver the project. */
export function isLeadAgent(system: AgenticSystem, index: number): boolean {
  return system.leadAgent.index === index
}

/** Whether this index is the human user rather than an AI agent. */
export function isUserIndex(system: AgenticSystem, index: number): boolean {
  return system.user.index === index
}

/** Indices of an agent's whole subtree (excluding itself). */
export function getSubtreeIndices(node: AgentNode): number[] {
  return (node.subagents ?? []).flatMap((child) => [child.index, ...getSubtreeIndices(child)])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isValidAgentNode(value: unknown, depth = 0): value is AgentNode {
  if (!isRecord(value) || depth > MAX_AGENTS) return false
  return (
    typeof value.id === "string" &&
    Number.isInteger(value.index) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.color === "string" &&
    typeof value.model === "string" &&
    (value.character === undefined || typeof value.character === "string") &&
    (value.subagents === undefined ||
      (Array.isArray(value.subagents) &&
        value.subagents.every((subagent) => isValidAgentNode(subagent, depth + 1))))
  )
}

/** Shape guard for teams read from storage, where hand edits or older versions may have left anything. */
export function isValidAgenticSystem(value: unknown): value is AgenticSystem {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.teamName === "string" &&
    isRecord(value.user) &&
    Number.isInteger(value.user.index) &&
    isValidAgentNode(value.leadAgent)
  )
}
