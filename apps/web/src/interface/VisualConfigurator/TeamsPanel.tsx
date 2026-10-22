import { Plus } from "lucide-react"
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DEFAULT_MODEL } from "../../core/llm/constants"
import { AGENTIC_SETS, type AgenticSystem } from "../../data/agents"
import { useTeamStore } from "../../integration/store/teamStore"
import { TeamCard } from "./TeamCard"
import { DEFAULT_AGENT_COLOR, type RequestDiscard } from "./teamTree"

interface TeamsPanelProps {
  selectedTeamId: string
  onSelectTeam: (id: string) => void
  mode: "view" | "edit"
  onModeChange: (mode: "view" | "edit") => void
  onDirtyChange: (dirty: boolean) => void
  requestDiscard: RequestDiscard
}

function createTeam(): AgenticSystem {
  const now = Date.now()
  return {
    id: `team-${now}`,
    teamName: "New Team",
    teamType: "Custom",
    teamDescription: "A custom agentic team.",
    color: DEFAULT_AGENT_COLOR,
    outputAutoApprove: true,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: `agent-${now}`,
      index: 1,
      name: "Lead Agent",
      description: "Coordinate the team to finish the project.",
      color: DEFAULT_AGENT_COLOR,
      model: DEFAULT_MODEL,
      position: { x: 0, y: 150 },
      subagents: [],
    },
  }
}

/**
 * Right-hand list of teams in the editor. Saved edits of built-in teams live in customSystems under
 * the same id and take precedence over the built-in definition.
 */
export function TeamsPanel({
  selectedTeamId,
  onSelectTeam,
  mode,
  onModeChange,
  onDirtyChange,
  requestDiscard,
}: TeamsPanelProps) {
  const { customSystems, selectedAgentSetId, upsertSystem } = useTeamStore(
    useShallow((state) => ({
      customSystems: state.customSystems,
      selectedAgentSetId: state.selectedAgentSetId,
      upsertSystem: state.upsertSystem,
    })),
  )

  const allSystems = useMemo(() => {
    const customIds = new Set(customSystems.map((system) => system.id))
    return [...customSystems, ...AGENTIC_SETS.filter((system) => !customIds.has(system.id))]
  }, [customSystems])

  const handleCreateNew = () =>
    requestDiscard(() => {
      const team = createTeam()
      upsertSystem(team)
      onSelectTeam(team.id)
      onModeChange("edit")
    })

  return (
    <aside aria-label="Teams" className="flex h-full w-96 shrink-0 flex-col border-l bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {allSystems.map((system) => (
            <TeamCard
              key={system.id}
              system={system}
              isSelected={selectedTeamId === system.id}
              isActive={selectedAgentSetId === system.id}
              mode={mode}
              onSelectTeam={onSelectTeam}
              onModeChange={onModeChange}
              onDirtyChange={onDirtyChange}
              requestDiscard={requestDiscard}
            />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Button
          onClick={handleCreateNew}
          className="h-11 w-full rounded-xl text-[11px] font-black shadow-lg shadow-black/5"
        >
          <Plus strokeWidth={3} />
          Create new team
        </Button>
      </div>
    </aside>
  )
}
