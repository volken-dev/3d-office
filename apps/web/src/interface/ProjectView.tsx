import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import { FileText, Info, RefreshCcw, ServerOff } from "lucide-react"
import { useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { Markdown } from "@/components/Markdown"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatTokens } from "@/lib/format"
import { totalTokensOf } from "@/lib/usage"
import { cn } from "@/lib/utils"
import { type ProjectPhase, type Task, useCoreStore } from "../integration/store/coreStore"
import { useTeamRoster } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import { useSceneManager } from "../simulation/SceneContext"
import { Avatar, avatarTypeFor } from "./components/Avatar"
import { SectionHeading } from "./components/SectionHeading"
import { selectAgent } from "./components/selectAgent"
import { SCROLL_AREA_BLOCK } from "./components/styles"
import { TokenUsageRow } from "./components/TokenUsageRow"
import PricingModal from "./PricingModal"
import ResetModal from "./ResetModal"

const GATEWAY_PROBLEMS = {
  unreachable: {
    title: "The model gateway is unreachable",
    description:
      "Agents call Claude through the model gateway. Check that it is running, then check again.",
  },
  not_configured: {
    title: "The model gateway has no Claude key",
    description:
      "The gateway is running but cannot call Claude yet. Add its Claude API key, then check again.",
  },
} as const

const PHASE_BADGE: Record<ProjectPhase, { label: string; className: string }> = {
  idle: { label: "Ready to start", className: "border-input bg-muted text-muted-foreground" },
  working: { label: "Working", className: "bg-user text-user-foreground" },
  done: { label: "Done", className: "bg-success text-success-foreground" },
}

type RosterStatus = { label: string; className: string }

function getRosterStatus(
  agent: AgentNode,
  system: AgenticSystem,
  phase: ProjectPhase,
  tasks: Task[],
): RosterStatus | null {
  const isLead = agent.index === system.leadAgent.index
  if (isLead && phase === "idle")
    return { label: "Awaiting brief", className: "bg-user/10 text-user" }
  if (isLead && phase === "done")
    return { label: "Project ready", className: "bg-yellow-100 text-yellow-800" }
  if (tasks.some((task) => task.assignedAgentId === agent.index && task.status === "on_hold"))
    return { label: "Needs review", className: "bg-user/10 text-user" }
  if (tasks.some((task) => task.assignedAgentId === agent.index && task.status === "in_progress"))
    return { label: "Working", className: "bg-emerald-50 text-emerald-700" }
  return null
}

/** Keyboard-reachable way to select agents, which otherwise can only be picked in the 3D canvas. */
function TeamRoster({ agents, system }: { agents: readonly AgentNode[]; system: AgenticSystem }) {
  const { phase, tasks } = useCoreStore(
    useShallow((state) => ({ phase: state.phase, tasks: state.tasks })),
  )

  return (
    <ul className="space-y-1">
      {agents.map((agent) => {
        const status = getRosterStatus(agent, system, phase, tasks)
        return (
          <li key={agent.index}>
            <Button
              variant="ghost"
              onClick={() => selectAgent(agent.index)}
              className="h-auto w-full justify-start gap-3 rounded-xl px-2 py-1.5"
            >
              <Avatar type={avatarTypeFor(system, agent.index)} color={agent.color} size={28} />
              <span className="min-w-0 flex-1 truncate text-left text-xs font-bold tracking-tight text-foreground">
                {agent.name}
              </span>
              {status && (
                <Badge className={cn("text-[11px] font-bold", status.className)}>
                  {status.label}
                </Badge>
              )}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Inspector body when no agent is selected: project status, brief, roster and spend. The
 * "Review deliverable" button is the way back in after "Review later" left the deliverable pending.
 */
function ProjectView() {
  const {
    userBrief,
    phase,
    hasLogs,
    resetProject,
    totalEstimatedCost,
    totalTokenUsage,
    agentTokenUsage,
    agentEstimatedCost,
  } = useCoreStore(
    useShallow((state) => ({
      userBrief: state.userBrief,
      phase: state.phase,
      hasLogs: state.actionLog.length > 0,
      resetProject: state.resetProject,
      totalEstimatedCost: state.totalEstimatedCost,
      totalTokenUsage: state.totalTokenUsage,
      agentTokenUsage: state.agentTokenUsage,
      agentEstimatedCost: state.agentEstimatedCost,
    })),
  )
  const canReopenReview = useCoreStore(
    (state) => state.pendingOutputPrompt !== "" && !state.isReviewingOutput,
  )
  const setReviewingOutput = useCoreStore((state) => state.setReviewingOutput)
  const gatewayStatus = useUiStore((state) => state.gatewayStatus)
  const checkGateway = useUiStore((state) => state.checkGateway)
  const gatewayProblem =
    gatewayStatus === "unreachable" || gatewayStatus === "not_configured"
      ? GATEWAY_PROBLEMS[gatewayStatus]
      : undefined
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false)
  const { system: activeTeam, agents, byIndex } = useTeamRoster()
  const scene = useSceneManager()

  const usageRows = useMemo(
    () =>
      Object.entries(agentTokenUsage)
        .flatMap(([agentIndex, usage]) => {
          const agent = byIndex.get(Number(agentIndex))
          return agent && usage && totalTokensOf(usage) > 0 ? [{ agent, usage }] : []
        })
        .sort((a, b) => totalTokensOf(b.usage) - totalTokensOf(a.usage)),
    [agentTokenUsage, byIndex],
  )

  const handleResetConfirm = () => {
    scene?.resetScene()
    resetProject()
    setIsResetModalOpen(false)
  }

  const phaseBadge = PHASE_BADGE[phase]

  return (
    <ScrollArea className={cn("h-full bg-background/50", SCROLL_AREA_BLOCK)}>
      <div className="flex flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl leading-tight font-black text-foreground">Project info</h2>
          <Badge
            className={cn(
              "gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-black",
              phaseBadge.className,
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full bg-current",
                phase === "working" ? "animate-pulse" : "opacity-40",
              )}
              aria-hidden
            />
            {phaseBadge.label}
          </Badge>
        </div>

        <div className="mb-6 h-px w-full bg-border" aria-hidden />

        {gatewayProblem && (
          <Alert className="mb-6 rounded-xl">
            <ServerOff />
            <AlertTitle>{gatewayProblem.title}</AlertTitle>
            <AlertDescription>
              <p>{gatewayProblem.description}</p>
              <Button size="cta" onClick={() => void checkGateway()} className="mt-2 h-8 px-3">
                Check again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {canReopenReview && (
          <Button
            size="cta"
            onClick={() => setReviewingOutput(true)}
            className="mb-6 h-12 w-full rounded-2xl shadow-xl shadow-primary/10"
          >
            <FileText strokeWidth={3} />
            Review deliverable
          </Button>
        )}

        {hasLogs && (
          <Button
            variant={phase === "done" ? "default" : "secondary"}
            size="cta"
            onClick={() => setIsResetModalOpen(true)}
            className={cn(
              "group mb-8 h-12 w-full rounded-2xl",
              phase === "done"
                ? "shadow-xl shadow-primary/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <RefreshCcw
              strokeWidth={3}
              className="transition-transform duration-500 group-hover:rotate-180"
            />
            Start new project
          </Button>
        )}

        <section className="mb-10">
          <SectionHeading label="User brief" className="mb-4" />
          {userBrief ? (
            <Markdown className="max-h-[300px] overflow-y-auto rounded-xl border border-border/50 bg-background/40 p-4 text-xs leading-relaxed font-medium text-foreground/80">
              {userBrief}
            </Markdown>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No active brief. Talk to the lead agent to define your project.
            </p>
          )}
        </section>

        <section className="mb-10">
          <SectionHeading label="Team" className="mb-3" />
          <TeamRoster agents={agents} system={activeTeam} />
        </section>

        <section className="mb-8">
          <SectionHeading
            label="Token usage"
            className="mb-4"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPricingModalOpen(true)}
                className="ml-2 h-7 gap-2 rounded-lg border-emerald-100 bg-emerald-50 px-2.5 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700"
              >
                <span className="text-[11px] font-black tracking-tight">
                  Total est. ${totalEstimatedCost.toFixed(3)}
                </span>
                <Info className="size-3" aria-hidden />
              </Button>
            }
          />

          <div className="mb-6 rounded-xl border border-border bg-muted/50 p-5">
            <p className="mb-6 font-mono text-4xl font-black tracking-tighter text-foreground">
              {formatTokens(totalTokensOf(totalTokenUsage))}
            </p>
            <TokenUsageRow usage={totalTokenUsage} />
          </div>

          <ul className="space-y-1">
            {usageRows.map(({ agent, usage }) => (
              <li
                key={agent.index}
                className="group flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="size-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]"
                    style={{ backgroundColor: agent.color }}
                    aria-hidden
                  />
                  <span className="text-xs font-bold tracking-tight text-foreground/80 transition-colors group-hover:text-foreground">
                    {agent.name}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    {agentEstimatedCost[agent.index] > 0 && (
                      <span className="font-mono text-[11px] font-bold text-emerald-700">
                        ${agentEstimatedCost[agent.index].toFixed(4)}
                      </span>
                    )}
                    <span className="font-mono text-xs font-black text-foreground">
                      {formatTokens(totalTokensOf(usage))}
                    </span>
                  </div>
                  <TokenUsageRow usage={usage} size="sm" className="text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <ResetModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onConfirm={handleResetConfirm}
        />
        {isPricingModalOpen && <PricingModal onClose={() => setIsPricingModalOpen(false)} />}
      </div>
    </ScrollArea>
  )
}

export default ProjectView
