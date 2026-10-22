import type { Usage } from "@the-delegation/shared/llm-messages"
import { formatTokens } from "@/lib/format"
import { promptTokensOf } from "@/lib/usage"
import { cn } from "@/lib/utils"

interface TokenUsageRowProps {
  usage: Usage
  size?: "sm" | "md"
  className?: string
}

/** Input (including cached) and output token counts side by side. */
export function TokenUsageRow({ usage, size = "md", className }: TokenUsageRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 font-mono font-bold",
        size === "md" ? "text-xs" : "text-[11px]",
        className,
      )}
    >
      <span className="text-foreground">
        {formatTokens(promptTokensOf(usage))}{" "}
        <span className="font-medium text-muted-foreground">input</span>
      </span>
      <span className="text-muted-foreground" aria-hidden>
        +
      </span>
      <span className="text-foreground">
        {formatTokens(usage.outputTokens)}{" "}
        <span className="font-medium text-muted-foreground">output</span>
      </span>
    </div>
  )
}
