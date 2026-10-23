import { EMPTY_USAGE } from "@/lib/usage"
import { useCoreStore } from "../integration/store/core-store"
import { useTeamRoster } from "../integration/store/team-store"
import { SectionHeading } from "./components/section-heading"
import { EYEBROW } from "./components/styles"
import { TokenUsageRow } from "./components/token-usage-row"

interface AgentStatusPanelProps {
  agentIndex: number
}

/** Inspector body for one agent: what it is, which model it runs, what it has spent and what it is doing. */
function AgentStatusPanel({ agentIndex }: AgentStatusPanelProps) {
  const activeTask = useCoreStore((state) =>
    state.tasks.find(
      (task) => task.assignedAgentId === agentIndex && task.status === "in_progress",
    ),
  )
  const usage = useCoreStore((state) => state.agentTokenUsage[agentIndex]) ?? EMPTY_USAGE
  const agent = useTeamRoster().byIndex.get(agentIndex)
  if (!agent) return null

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-8 space-y-6">
        <section>
          <SectionHeading label="Description" className="mb-2" />
          <p className="text-xs leading-relaxed font-medium text-foreground/80 first-letter:uppercase">
            {agent.description}
          </p>
        </section>
        <section>
          <SectionHeading label="Model" className="mb-2" />
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono">
            <p className="text-xs font-bold tracking-tighter text-foreground">{agent.model}</p>
          </div>
        </section>
        <section>
          <SectionHeading label="Token usage" className="mb-2" />
          <TokenUsageRow usage={usage} />
        </section>
      </div>

      <div className="mb-6 h-px w-full bg-border" aria-hidden />

      {activeTask ? (
        <section className="mb-6">
          <h3 className={`${EYEBROW} mb-2 flex items-center gap-2`}>
            <span className="relative flex size-2" aria-hidden>
              <span
                className="absolute inline-flex size-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: agent.color }}
              />
              <span
                className="relative inline-flex size-2 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
            </span>
            Doing now
          </h3>
          <p className="text-sm leading-snug font-bold text-foreground">
            &ldquo;{activeTask.title}&rdquo;
          </p>
        </section>
      ) : (
        <section className="mb-6">
          <h3 className={`${EYEBROW} mb-2`}>Status</h3>
          <p className="text-sm leading-snug font-medium text-muted-foreground italic">
            Waiting for next task...
          </p>
        </section>
      )}
    </div>
  )
}

export default AgentStatusPanel
