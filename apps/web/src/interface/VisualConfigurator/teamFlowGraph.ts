import type { Edge, Node } from "@xyflow/react"
import { type AgenticSystem, type AgentNode, USER_ID, USER_NAME } from "../../data/agents"
import { USER_COLOR } from "../../theme/brand"

/** One connector dot on a node; nodes render their handles in insertion order. */
export interface HandleData {
  id: string
  type: "hierarchy"
  color: string
  role: "source" | "target"
}

/** A type alias (not an interface) so it satisfies React Flow's Record<string, unknown> data constraint. */
export type VisualAgentNodeData = {
  label: string
  agent?: AgentNode
  isLead?: boolean
  color?: string
  isDimmed?: boolean
  topHandles: HandleData[]
  bottomHandles: HandleData[]
}

/** A team member (or the user) as a React Flow node. */
export type VisualAgentNode = Node<VisualAgentNodeData, "agent" | "user">

const USER_EDGE_COLOR = "var(--input)"

/**
 * Lays a team out as React Flow nodes and edges. Hierarchy edges always run from the parent's
 * bottom to the child's top, and handle insertion order follows the subagents array so connectors
 * don't cross when x-positions are aligned.
 */
export function systemToFlow(system: AgenticSystem): { nodes: VisualAgentNode[]; edges: Edge[] } {
  const allNodes: VisualAgentNode[] = []
  const allEdges: Edge[] = []
  const handles = new Map<string, { top: HandleData[]; bottom: HandleData[] }>()
  const agentMap = new Map<string, AgentNode>()
  const processedAgentIds = new Set<string>()

  const addHandle = (nodeId: string, side: "top" | "bottom", handle: HandleData) => {
    let nodeHandles = handles.get(nodeId)
    if (!nodeHandles) {
      nodeHandles = { top: [], bottom: [] }
      handles.set(nodeId, nodeHandles)
    }
    if (!nodeHandles[side].some((existing) => existing.id === handle.id)) {
      nodeHandles[side].push(handle)
    }
  }

  const traverse = (agent: AgentNode) => {
    agentMap.set(agent.id, agent)
    if (processedAgentIds.has(agent.id)) return
    processedAgentIds.add(agent.id)

    if (agent.subagents) {
      agent.subagents.forEach((subagent) => {
        const edgeId = `h-${agent.id}-${subagent.id}`
        const color = `${agent.color}44`
        addHandle(agent.id, "bottom", {
          id: `${edgeId}-src`,
          type: "hierarchy",
          color,
          role: "source",
        })
        addHandle(subagent.id, "top", {
          id: `${edgeId}-tgt`,
          type: "hierarchy",
          color,
          role: "target",
        })

        allEdges.push({
          id: edgeId,
          source: agent.id,
          sourceHandle: `${edgeId}-src`,
          target: subagent.id,
          targetHandle: `${edgeId}-tgt`,
          type: "hierarchy",
          animated: true,
          style: { stroke: color, strokeWidth: 2, strokeDasharray: "5,5" },
        })
        traverse(subagent)
      })
    }
  }

  allNodes.push({
    id: USER_ID,
    type: "user",
    data: {
      label: `${USER_NAME} (You)`,
      color: USER_COLOR,
      topHandles: [],
      bottomHandles: [],
    },
    position: system.user.position || { x: 0, y: 0 },
  })

  const lead = system.leadAgent
  const leadEdgeId = `h-user-${lead.id}`
  addHandle(USER_ID, "bottom", {
    id: `${leadEdgeId}-src`,
    type: "hierarchy",
    color: USER_EDGE_COLOR,
    role: "source",
  })
  addHandle(lead.id, "top", {
    id: `${leadEdgeId}-tgt`,
    type: "hierarchy",
    color: USER_EDGE_COLOR,
    role: "target",
  })

  allEdges.push({
    id: leadEdgeId,
    source: USER_ID,
    sourceHandle: `${leadEdgeId}-src`,
    target: lead.id,
    targetHandle: `${leadEdgeId}-tgt`,
    type: "hierarchy",
    style: { stroke: USER_EDGE_COLOR, strokeWidth: 1, strokeDasharray: "5,5" },
  })

  traverse(lead)

  agentMap.forEach((agent, id) => {
    allNodes.push({
      id,
      type: "agent",
      data: {
        label: agent.name,
        agent,
        isLead: id === system.leadAgent.id,
        color: agent.color,
        topHandles: [],
        bottomHandles: [],
      },
      position: agent.position || { x: 0, y: 0 },
    })
  })

  allNodes.forEach((node) => {
    const nodeHandles = handles.get(node.id)
    if (nodeHandles) {
      node.data.topHandles = nodeHandles.top
      node.data.bottomHandles = nodeHandles.bottom
    }
  })

  return { nodes: allNodes, edges: allEdges }
}
