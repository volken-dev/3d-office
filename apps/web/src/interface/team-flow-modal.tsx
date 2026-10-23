import { Background, type Edge, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { AgenticSystem } from "@the-delegation/agents/team"
import { useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TeamBadge } from "./components/team-badge"
import { TeamOutputBadge } from "./components/team-output-badge"
import { flowEdgeTypes, flowNodeTypes } from "./visual-configurator/flow-types"
import { useFlowFocus } from "./visual-configurator/hooks/use-flow-focus"
import { systemToFlow, type VisualAgentNode } from "./visual-configurator/team-flow-graph"

interface TeamFlowModalProps {
  isOpen?: boolean
  onClose: () => void
  system: AgenticSystem
}

/** Read-only flow of the team; fits the view after the dialog's open animation so it measures the final size. */
function FlowViewport({ system }: { system: AgenticSystem }) {
  const { fitView } = useReactFlow()
  const { nodes, edges } = useMemo<{ nodes: VisualAgentNode[]; edges: Edge[] }>(
    () => systemToFlow(system),
    [system],
  )

  const { nodesWithFocus, edgesWithFocus } = useFlowFocus(nodes, edges, null, system.leadAgent.id)

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 })
    }, 100)
    return () => clearTimeout(timer)
  }, [fitView])

  return (
    <ReactFlow
      nodes={nodesWithFocus}
      edges={edgesWithFocus}
      nodeTypes={flowNodeTypes}
      edgeTypes={flowEdgeTypes}
      nodeOrigin={[0.5, 0]}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      nodesDraggable={false}
      elementsSelectable={false}
      zoomOnScroll
      maxZoom={1.5}
      minZoom={0.2}
      className="bg-muted/30"
    >
      <Background gap={24} color="#bbbbbb" size={2} />
    </ReactFlow>
  )
}

/** Read-only diagram of the active team's hierarchy, opened from the team badge above the canvas. */
function TeamFlowModal({ isOpen = true, onClose, system }: TeamFlowModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-w-7xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-[calc(100dvh-5rem)] sm:max-w-7xl">
        <DialogHeader className="h-16 shrink-0 flex-row items-center gap-4 border-b border-border px-6 pr-14">
          <DialogTitle className="sr-only">{system.teamName} team structure</DialogTitle>
          <DialogDescription className="sr-only">
            Visual representation of the team&apos;s operational flow, with the lead agent in focus.
          </DialogDescription>
          <TeamBadge system={system} />
          <TeamOutputBadge system={system} className="hidden sm:flex" />
        </DialogHeader>

        <div className="relative min-h-0 flex-1">
          <ReactFlowProvider>
            <FlowViewport system={system} />
          </ReactFlowProvider>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-6 overflow-x-auto border-t border-border bg-muted/40 px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-0.5 w-3 border-t border-dashed border-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-xs font-bold text-muted-foreground">Hierarchy (managed)</span>
          </div>
          <p className="text-xs font-medium italic text-muted-foreground">
            Visual representation of the team&apos;s operational flow.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TeamFlowModal
