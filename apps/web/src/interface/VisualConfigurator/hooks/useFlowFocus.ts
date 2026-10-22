import { USER_ID } from "@the-delegation/agents/team"
import type { Edge } from "@xyflow/react"
import { useMemo } from "react"
import type { VisualAgentNode } from "../teamFlowGraph"

/** Dims the other subagents and their edges while a subagent is selected; the user-to-lead path stays visible. */
export function useFlowFocus(
  nodes: VisualAgentNode[],
  edges: Edge[],
  selectedAgentId: string | null,
  leadAgentId: string,
) {
  const isSubagentSelected = useMemo(() => {
    const selected = selectedAgentId ? nodes.find((node) => node.id === selectedAgentId) : null
    return selected?.type === "agent" && !selected.data.isLead
  }, [nodes, selectedAgentId])

  const nodesWithFocus = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isDimmed:
            isSubagentSelected &&
            node.type === "agent" &&
            !node.data.isLead &&
            node.id !== selectedAgentId,
        },
      })),
    [nodes, selectedAgentId, isSubagentSelected],
  )

  const edgesWithFocus = useMemo(
    () =>
      edges.map((edge) => {
        const involvesSelected = edge.source === selectedAgentId || edge.target === selectedAgentId
        const isCorePath =
          (edge.source === USER_ID || edge.target === USER_ID) &&
          (edge.source === leadAgentId || edge.target === leadAgentId)
        const visible = !isSubagentSelected || involvesSelected || isCorePath
        return {
          ...edge,
          style: { ...edge.style, opacity: visible ? 1 : 0.05 },
          animated: visible ? edge.animated : false,
        }
      }),
    [edges, selectedAgentId, leadAgentId, isSubagentSelected],
  )

  return { nodesWithFocus, edgesWithFocus }
}
