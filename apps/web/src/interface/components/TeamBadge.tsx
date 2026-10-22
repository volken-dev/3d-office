import { Users } from "lucide-react"
import { type AgenticSystem, getTeamRoster } from "../../data/agents"

interface TeamBadgeProps {
  system: AgenticSystem
}

/** Team colour chip with its agent count, name and type. */
export function TeamBadge({ system }: TeamBadgeProps) {
  const agentCount = getTeamRoster(system).agents.length

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 items-center justify-center gap-2 rounded-xl px-3 shadow-lg shadow-black/5"
        style={{ backgroundColor: system.color }}
      >
        <Users className="size-3.5 text-white opacity-90" strokeWidth={3} aria-hidden />
        <span className="text-xs leading-none font-black text-white">
          {agentCount}
          <span className="sr-only"> agents</span>
        </span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-sm leading-tight font-black text-foreground">{system.teamName}</span>
        <span className="text-[11px] leading-tight font-bold text-muted-foreground">
          {system.teamType}
        </span>
      </div>
    </div>
  )
}
