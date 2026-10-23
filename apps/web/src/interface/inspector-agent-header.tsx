import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, avatarTypeFor } from "./components/avatar"
import { selectAgent } from "./components/select-agent"

/** Back button, avatar, name and role badge at the top of the agent inspector. */
export function InspectorAgentHeader({
  agent,
  system,
}: {
  agent: AgentNode
  system: AgenticSystem
}) {
  const avatarType = avatarTypeFor(system, agent.index)

  return (
    <div className="flex items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to project"
            onClick={() => selectAgent(null)}
            className="-ml-1 text-muted-foreground"
          >
            <ArrowLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to project</TooltipContent>
      </Tooltip>
      <div className="shrink-0 rounded-2xl border border-border bg-muted/50 p-0.5">
        <Avatar type={avatarType} color={agent.color} size={48} />
      </div>
      <div className="flex min-w-0 flex-col">
        <h2 className="truncate text-xl leading-tight font-black text-foreground">{agent.name}</h2>
        {avatarType !== "user" && (
          <Badge
            className="mt-1 h-5 rounded border px-1.5 text-[11px] font-black tracking-tight shadow-sm"
            style={{
              backgroundColor: `${agent.color}15`,
              color: agent.color,
              borderColor: `${agent.color}30`,
            }}
          >
            {avatarType === "lead" ? "Lead agent" : "Subagent"}
          </Badge>
        )}
      </div>
    </div>
  )
}
