import type { AgenticSystem } from "@the-delegation/agents/team"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface TeamOutputBadgeProps {
  system: AgenticSystem
  className?: string
}

/** Whether the team's final deliverable is auto-approved or waits for the user, with the detail in a tooltip. */
export function TeamOutputBadge({ system, className }: TeamOutputBadgeProps) {
  const autoApprove = system.outputAutoApprove !== false
  const hint = autoApprove
    ? "Final deliverable is delivered automatically"
    : "Final deliverable requires your review and approval"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          aria-label={`${autoApprove ? "Auto approve" : "Manual review"}: ${hint}`}
          className={cn(
            "h-7 gap-1.5 rounded-xl bg-muted/50 px-3 text-[11px] font-black text-muted-foreground",
            className,
          )}
        >
          <FileText strokeWidth={2.5} aria-hidden />
          <span
            className={cn("size-1.5 rounded-full", autoApprove ? "bg-success" : "bg-user")}
            aria-hidden
          />
          {autoApprove ? "Auto approve" : "Manual review"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-center">{hint}</TooltipContent>
    </Tooltip>
  )
}
