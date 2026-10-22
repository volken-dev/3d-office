import { MessageSquareWarning, PartyPopper, Siren } from "lucide-react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AgenticSystem, AgentNode } from "../data/agents"
import { useAgentAnchor } from "../integration/screenPositions"
import type { ProjectPhase, Task } from "../integration/store/coreStore"

/**
 * These bubbles move every frame over the WebGPU canvas, so they use opaque fills instead of
 * backdrop-blur (which would force the compositor to re-blur the canvas underneath each frame).
 */
const BUBBLE = "rounded-full border border-white/10 bg-primary/95 shadow-xl"

type AlertKind = "awaiting-brief" | "project-ready" | "needs-review"

const ALERTS: Record<
  AlertKind,
  { icon: React.ReactNode; className: string; label: (name: string) => string }
> = {
  "awaiting-brief": {
    icon: <Siren className="size-[18px]" aria-hidden />,
    className: "text-white",
    label: (name) => `${name} is waiting for your brief`,
  },
  "project-ready": {
    icon: <PartyPopper className="size-[18px]" aria-hidden />,
    className: "text-yellow-400",
    label: (name) => `${name}: project ready`,
  },
  "needs-review": {
    icon: <MessageSquareWarning className="size-[18px]" aria-hidden />,
    className: "text-user",
    label: (name) => `${name} needs your review`,
  },
}

/** Which alert bubble, if any, an agent should show over its head right now. */
export function getAlertForAgent(
  agentIndex: number,
  system: AgenticSystem,
  phase: ProjectPhase,
  tasks: Task[],
): AlertKind | null {
  if (agentIndex === system.leadAgent.index && phase === "idle") return "awaiting-brief"
  if (agentIndex === system.leadAgent.index && phase === "done") return "project-ready"
  if (tasks.some((task) => task.status === "on_hold" && task.assignedAgentId === agentIndex))
    return "needs-review"
  return null
}

interface AlertBubbleProps {
  kind: AlertKind
  agent: AgentNode
  onSelect: (index: number) => void
}

/** Clickable alert over an agent that needs the user; it tracks the agent's screen position every frame. */
export function AlertBubble({ kind, agent, onSelect }: AlertBubbleProps) {
  const anchorRef = useAgentAnchor<HTMLButtonElement>(agent.index)
  const alert = ALERTS[kind]

  return (
    <Button
      ref={anchorRef}
      variant="bare"
      size="bare"
      aria-label={alert.label(agent.name)}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(agent.index)
      }}
      className="pointer-events-auto absolute top-0 left-0 z-20 rounded-full transition-none will-change-transform focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          BUBBLE,
          "flex items-center justify-center p-1.5 transition-transform hover:scale-110 hover:border-white/30 active:scale-95",
          alert.className,
        )}
      >
        {alert.icon}
      </span>
    </Button>
  )
}

type PhaseLabel = { text: string; className: string }

function getAgentPhaseLabel(
  agentIndex: number,
  leadAgentIndex: number,
  tasks: Task[],
  phase: ProjectPhase,
): PhaseLabel | null {
  if (agentIndex === leadAgentIndex && phase === "done")
    return { text: "Project ready", className: "text-yellow-400" }
  if (
    phase !== "done" &&
    tasks.some((task) => task.assignedAgentId === agentIndex && task.status === "on_hold")
  ) {
    return { text: "Approval needed", className: "text-user" }
  }
  if (tasks.some((task) => task.assignedAgentId === agentIndex && task.status === "in_progress")) {
    return { text: "Working", className: "text-emerald-400" }
  }
  return null
}

const LABEL_TEXT = "text-[11px] font-black"

interface FocusedAgentLabelProps {
  agent: AgentNode
  system: AgenticSystem
  phase: ProjectPhase
  tasks: Task[]
}

/** Name and status pill that follows the selected or hovered character around the scene. */
export function FocusedAgentLabel({ agent, system, phase, tasks }: FocusedAgentLabelProps) {
  const anchorRef = useAgentAnchor<HTMLDivElement>(agent.index)
  const isUser = agent.index === system.user.index
  const label = getAgentPhaseLabel(agent.index, system.leadAgent.index, tasks, phase)
  const isProjectReady = agent.index === system.leadAgent.index && phase === "done"

  return (
    <div
      ref={anchorRef}
      className="pointer-events-none absolute top-0 left-0 z-25 will-change-transform"
    >
      <div className={cn(BUBBLE, "flex items-center gap-2 px-3 py-1.5 whitespace-nowrap")}>
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
        {isUser ? (
          <span className={cn(LABEL_TEXT, "text-white")}>{agent.name} (You)</span>
        ) : isProjectReady && label ? (
          <span className={cn(LABEL_TEXT, label.className)}>{label.text}</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className={cn(LABEL_TEXT, "text-white")}>{agent.name}</span>
            {label && (
              <>
                <span className="size-1 shrink-0 rounded-full bg-white/40" aria-hidden />
                <span className={cn(LABEL_TEXT, "font-bold", label.className)}>{label.text}</span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

/** Hover hint for a point of interest in the office, positioned from the scene's hover event. */
export function PoiBubble({
  label,
  position,
}: {
  label: string
  position: { x: number; y: number }
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 transition-all duration-75 ease-out"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -100%) translateY(-10px)",
      }}
    >
      <div className={cn(BUBBLE, "flex items-center gap-2 px-3 py-1.5 whitespace-nowrap")}>
        <span className={cn(LABEL_TEXT, "text-white")}>{label}</span>
      </div>
    </div>
  )
}
