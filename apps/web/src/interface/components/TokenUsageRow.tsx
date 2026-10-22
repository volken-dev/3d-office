import type { LLMTokenUsage } from "@the-delegation/agents/llm/types"
import { formatTokens } from "@/lib/format"
import { cn } from "@/lib/utils"

interface TokenUsageRowProps {
  usage: Pick<LLMTokenUsage, "promptTokens" | "completionTokens">
  size?: "sm" | "md"
  className?: string
}

/** Input and output token counts side by side. */
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
        {formatTokens(usage.promptTokens)}{" "}
        <span className="font-medium text-muted-foreground">input</span>
      </span>
      <span className="text-muted-foreground" aria-hidden>
        +
      </span>
      <span className="text-foreground">
        {formatTokens(usage.completionTokens)}{" "}
        <span className="font-medium text-muted-foreground">output</span>
      </span>
    </div>
  )
}
