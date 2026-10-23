import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  type AgenticSystem,
  type AgentNode,
  MAX_AGENTS,
  USER_ID,
} from "@the-delegation/agents/team"
import { DEFAULT_TEAM_MODEL_ID } from "@the-delegation/llm/registry"
import { Plus, Settings, User, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getAgentSet, getAllCharacters } from "../../data/agents"
import { useCoreStore } from "../../integration/store/coreStore"
import { useTeamStore } from "../../integration/store/teamStore"
import { AgentConfigPanel } from "./AgentConfigPanel"
import { DisabledReason } from "./Field"
import { flowEdgeTypes, flowNodeTypes } from "./flowTypes"
import { useFlowFocus } from "./hooks/useFlowFocus"
import { TeamJsonDialog } from "./TeamJsonDialog"
import { TeamsPanel } from "./TeamsPanel"
import { systemToFlow, type VisualAgentNode } from "./teamFlowGraph"
import {
  type AgentDraft,
  addSubagent,
  agentDraftOf,
  DEFAULT_AGENT_COLOR,
  type DiscardScope,
  isAgentDraftDirty,
  MAX_CHARACTERS,
  nextAgentIndex,
  placeNewSubagent,
  removeAgent,
  updateAgent,
} from "./teamTree"

const ROSTER_LOCKED = "Agents cannot be added or removed while this team is working on a project."

function EditorHeader({ onClose, system }: { onClose: () => void; system: AgenticSystem }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <h2 className="flex items-center gap-2.5 text-xs font-black text-primary">
          <Settings className="size-[18px]" strokeWidth={2} />
          Manage teams
        </h2>
        <TeamJsonDialog system={system} />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close team editor"
            className="rounded-xl text-muted-foreground hover:text-primary"
          >
            <X className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close team editor</TooltipContent>
      </Tooltip>
    </header>
  )
}

function AgentPlaceholder() {
  return (
    <div className="flex w-80 flex-col items-center justify-center p-8 text-center text-muted-foreground">
      <User className="mb-4 size-8 opacity-30" strokeWidth={1.5} />
      <p className="text-[11px] font-bold">Select an agent</p>
      <p className="mt-2 text-xs italic leading-relaxed">
        Click any node in the flow to view and edit its details.
      </p>
    </div>
  )
}

function uniqueAgentName(characters: AgentNode[]): string {
  const taken = new Set(characters.map((character) => character.name.toLowerCase()))
  let suffix = characters.length
  while (taken.has(`specialist ${suffix}`)) suffix++
  return `Specialist ${suffix}`
}

/**
 * The team editor. It follows the active team when that changes (switch or delete) by adjusting
 * state during render instead of in an effect. The agent draft previews on its node without
 * touching the store, and node selection mirrors the editor's selection.
 */
function VisualConfiguratorContent() {
  const { selectedAgentSetId, customSystems, upsertSystem } = useTeamStore(
    useShallow((state) => ({
      selectedAgentSetId: state.selectedAgentSetId,
      customSystems: state.customSystems,
      upsertSystem: state.upsertSystem,
    })),
  )
  const { setViewMode, viewMode, phase } = useCoreStore(
    useShallow((state) => ({
      setViewMode: state.setViewMode,
      viewMode: state.viewMode,
      phase: state.phase,
    })),
  )
  const { fitView } = useReactFlow()

  const [configMode, setConfigMode] = useState<"view" | "edit">("view")
  const [selectedTeamId, setSelectedTeamId] = useState<string>(selectedAgentSetId)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null)
  const [teamDraftDirty, setTeamDraftDirty] = useState(false)
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null)

  const [syncedActiveId, setSyncedActiveId] = useState(selectedAgentSetId)
  if (syncedActiveId !== selectedAgentSetId) {
    setSyncedActiveId(selectedAgentSetId)
    setSelectedTeamId(selectedAgentSetId)
  }

  const system = useMemo(
    () => getAgentSet(selectedTeamId, customSystems),
    [selectedTeamId, customSystems],
  )
  const characters = useMemo(() => getAllCharacters(system), [system])
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => systemToFlow(system), [system])

  const [nodes, setNodes] = useState<VisualAgentNode[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)
  const [flowSystem, setFlowSystem] = useState(system)
  if (flowSystem !== system) {
    setFlowSystem(system)
    setNodes(initialNodes)
    setEdges(initialEdges)
  }

  const activeAgent = useMemo(
    () =>
      selectedAgentId && selectedAgentId !== USER_ID
        ? (characters.find((character) => character.id === selectedAgentId) ?? null)
        : null,
    [selectedAgentId, characters],
  )
  const agentDirty = !!(agentDraft && activeAgent && isAgentDraftDirty(agentDraft, activeAgent))

  const rosterLocked = selectedTeamId === selectedAgentSetId && phase === "working"
  const atCapacity = characters.length >= MAX_CHARACTERS

  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only when the editor opens or the team changes, not on content edits
  useEffect(() => {
    if (viewMode !== "design") return
    const timer = setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100)
    return () => clearTimeout(timer)
  }, [viewMode, selectedTeamId, fitView])

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const selected = node.id === selectedAgentId
        if (agentDraft && node.id === agentDraft.id && node.data.agent) {
          return {
            ...node,
            selected,
            data: {
              ...node.data,
              label: agentDraft.name,
              color: agentDraft.color,
              agent: { ...node.data.agent, ...agentDraft },
            },
          }
        }
        return node.selected === selected ? node : { ...node, selected }
      }),
    [nodes, agentDraft, selectedAgentId],
  )

  const { nodesWithFocus, edgesWithFocus } = useFlowFocus(
    displayNodes,
    edges,
    selectedAgentId,
    system.leadAgent.id,
  )

  const requestDiscard = useCallback(
    (action: () => void, scope: DiscardScope = "all") => {
      const loses = (scope !== "team" && agentDirty) || (scope !== "agent" && teamDraftDirty)
      if (loses) setPendingDiscard(() => action)
      else action()
    },
    [agentDirty, teamDraftDirty],
  )

  const selectAgent = useCallback(
    (id: string | null) => {
      setSelectedAgentId(id)
      const agent =
        id && id !== USER_ID ? characters.find((character) => character.id === id) : undefined
      setAgentDraft(agent ? agentDraftOf(agent) : null)
    },
    [characters],
  )

  const onNodesChange = useCallback((changes: NodeChange<VisualAgentNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges))
  }, [])

  const onNodeDragStop: OnNodeDrag<VisualAgentNode> = useCallback(
    (_, { id, position }) => {
      const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
      upsertSystem(
        id === USER_ID
          ? { ...system, user: { ...system.user, position: rounded } }
          : updateAgent(system, id, { position: rounded }),
      )
    },
    [system, upsertSystem],
  )

  const onNodeClick: NodeMouseHandler<VisualAgentNode> = useCallback(
    (_, node) => {
      if (node.id !== selectedAgentId) requestDiscard(() => selectAgent(node.id), "agent")
    },
    [selectedAgentId, requestDiscard, selectAgent],
  )

  const onPaneClick = useCallback(() => {
    if (selectedAgentId) requestDiscard(() => selectAgent(null), "agent")
  }, [selectedAgentId, requestDiscard, selectAgent])

  const handleExit = useCallback(() => {
    requestDiscard(() => {
      selectAgent(null)
      setConfigMode("view")
      setViewMode("simulation")
    })
  }, [requestDiscard, selectAgent, setViewMode])

  const handleSaveAgent = useCallback(() => {
    if (!agentDraft) return
    const { id, ...changes } = agentDraft
    upsertSystem(updateAgent(system, id, changes))
    toast.success(`Updated ${agentDraft.name}`)
    selectAgent(null)
  }, [agentDraft, system, upsertSystem, selectAgent])

  const handleRemoveAgent = useCallback(() => {
    if (!activeAgent || rosterLocked) return
    upsertSystem(removeAgent(system, activeAgent.id))
    toast(`Removed ${activeAgent.name}`)
    selectAgent(null)
  }, [activeAgent, rosterLocked, system, upsertSystem, selectAgent])

  const handleAddAgent = useCallback(() => {
    if (!activeAgent || atCapacity || rosterLocked) return
    const newAgent: AgentNode = {
      id: `agent-${Date.now()}`,
      index: nextAgentIndex(characters),
      name: uniqueAgentName(characters),
      description: "Collaborate with the team to achieve the project goals.",
      color: DEFAULT_AGENT_COLOR,
      model: DEFAULT_TEAM_MODEL_ID,
      position: placeNewSubagent(activeAgent, characters),
    }
    requestDiscard(() => {
      upsertSystem(addSubagent(system, activeAgent.id, newAgent))
      setSelectedAgentId(newAgent.id)
      setAgentDraft(agentDraftOf(newAgent))
    }, "agent")
  }, [activeAgent, atCapacity, rosterLocked, characters, system, upsertSystem, requestDiscard])

  const handleSelectTeam = useCallback(
    (id: string) => {
      if (id === selectedTeamId) return
      requestDiscard(() => {
        setSelectedTeamId(id)
        selectAgent(null)
        setConfigMode("view")
      })
    },
    [selectedTeamId, requestDiscard, selectAgent],
  )

  const takenNames = useMemo(
    () =>
      characters
        .filter((character) => character.id !== activeAgent?.id)
        .map((character) => character.name.toLowerCase().trim()),
    [characters, activeAgent],
  )

  const addDisabledReason = rosterLocked
    ? ROSTER_LOCKED
    : atCapacity
      ? `Teams are limited to ${MAX_AGENTS} agents.`
      : null

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-muted/40">
      <EditorHeader onClose={handleExit} system={system} />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex shrink-0 border-r bg-background">
          {activeAgent && agentDraft ? (
            <AgentConfigPanel
              key={activeAgent.id}
              agent={activeAgent}
              draft={agentDraft}
              isLead={activeAgent.id === system.leadAgent.id}
              takenNames={takenNames}
              mode={configMode}
              onChange={(changes) =>
                setAgentDraft((currentDraft) =>
                  currentDraft ? { ...currentDraft, ...changes } : currentDraft,
                )
              }
              onSave={handleSaveAgent}
              onClose={() => requestDiscard(() => selectAgent(null), "agent")}
              onRemove={handleRemoveAgent}
              lockedReason={rosterLocked ? ROSTER_LOCKED : null}
            />
          ) : (
            <AgentPlaceholder />
          )}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodesWithFocus}
            edges={edgesWithFocus}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={flowNodeTypes}
            edgeTypes={flowEdgeTypes}
            nodeOrigin={[0.5, 0]}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesConnectable={configMode === "edit"}
            nodesDraggable={configMode === "edit"}
            elementsSelectable
            zoomOnScroll
            maxZoom={1.5}
            minZoom={0.5}
          >
            <Background gap={24} color="#bbbbbb" size={2} />
            {configMode === "edit" && activeAgent && (
              <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300">
                <DisabledReason reason={addDisabledReason}>
                  <Button
                    onClick={handleAddAgent}
                    disabled={!!addDisabledReason}
                    className="h-11 rounded-xl px-8 text-[11px] font-black shadow-lg shadow-black/5"
                  >
                    <Plus strokeWidth={3} />
                    Add subagent to {activeAgent.name}
                  </Button>
                </DisabledReason>
                <p className="text-[11px] font-bold text-muted-foreground">
                  Maximum {MAX_AGENTS} agents allowed
                </p>
              </div>
            )}
          </ReactFlow>
        </div>

        <TeamsPanel
          selectedTeamId={selectedTeamId}
          onSelectTeam={handleSelectTeam}
          mode={configMode}
          onModeChange={setConfigMode}
          onDirtyChange={setTeamDraftDirty}
          requestDiscard={requestDiscard}
        />
      </div>

      <ConfirmDialog
        open={!!pendingDiscard}
        onOpenChange={(open) => !open && setPendingDiscard(null)}
        title="Discard unsaved changes?"
        description="Your edits have not been saved and will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onConfirm={() => {
          pendingDiscard?.()
          setPendingDiscard(null)
        }}
      />
    </div>
  )
}

/** Design-mode team editor: teams list, React Flow hierarchy and the agent detail panel. */
export function VisualConfigurator() {
  return (
    <ReactFlowProvider>
      <VisualConfiguratorContent />
    </ReactFlowProvider>
  )
}
