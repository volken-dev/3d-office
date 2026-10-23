import type { EdgeTypes, NodeTypes } from "@xyflow/react"
import { DirectionalEdge } from "./edges/directional-edge"
import { VisualFlowNode } from "./nodes/visual-flow-node"

/** Shared by the editor and the read-only TeamFlowModal; module-level so React Flow never sees new objects. */
export const flowNodeTypes: NodeTypes = {
  agent: VisualFlowNode,
  user: VisualFlowNode,
}

/** Every edge type renders as the lane-aware DirectionalEdge. */
export const flowEdgeTypes: EdgeTypes = {
  default: DirectionalEdge,
  hierarchy: DirectionalEdge,
  smoothstep: DirectionalEdge,
}
