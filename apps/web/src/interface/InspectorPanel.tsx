import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTeamRoster } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import AgentStatusPanel from "./AgentStatusPanel"
import ChatPanel from "./ChatPanel"
import { InspectorAgentActions } from "./InspectorAgentActions"
import { InspectorAgentHeader } from "./InspectorAgentHeader"
import ProjectView from "./ProjectView"

interface InspectorPanelProps {
  /** Rendered as a card over the canvas in focus mode instead of a docked sidebar. */
  isFloating?: boolean
  className?: string
}

/** Right-hand panel: the project overview, or the selected agent's details and chat. */
function InspectorPanel({ isFloating, className }: InspectorPanelProps) {
  const { selectedNpcIndex, isChatting } = useUiStore(
    useShallow((state) => ({
      selectedNpcIndex: state.selectedNpcIndex,
      isChatting: state.isChatting,
    })),
  )
  const { system, byIndex } = useTeamRoster()
  const agent = selectedNpcIndex !== null ? byIndex.get(selectedNpcIndex) : undefined

  if (!agent && isFloating) return null

  return (
    <aside
      aria-label={agent ? `${agent.name} details` : "Project"}
      className={cn(
        "relative z-30 flex shrink-0 flex-col overflow-hidden bg-background",
        isFloating
          ? "pointer-events-auto h-full max-h-[85vh] w-full self-end rounded-2xl border border-white/20 shadow-2xl"
          : "h-full w-80 border-l border-border",
        className,
      )}
    >
      {!agent ? (
        <ProjectView />
      ) : (
        <>
          <div
            className={cn(
              "flex flex-col gap-4 border-b border-border px-4 py-3",
              isFloating ? "bg-muted/25" : "bg-background",
            )}
          >
            <InspectorAgentHeader agent={agent} system={system} />
            <InspectorAgentActions agent={agent} system={system} />
          </div>

          {isChatting ? (
            <div className="flex min-h-0 flex-1 flex-col bg-background">
              <div className="min-h-0 flex-1">
                <ChatPanel />
              </div>
              <div className="shrink-0 border-t border-border p-3">
                <Button
                  size="cta"
                  onClick={() => useUiStore.getState().setChatting(false)}
                  className="h-10 w-full shadow-md"
                >
                  <span
                    className="size-1.5 animate-pulse rounded-full bg-primary-foreground"
                    aria-hidden
                  />
                  Close chat
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                isFloating ? "bg-background" : "bg-muted/15",
              )}
            >
              <AgentStatusPanel agentIndex={agent.index} />
            </div>
          )}
        </>
      )}
    </aside>
  )
}

export default InspectorPanel
