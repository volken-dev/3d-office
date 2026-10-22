import { HelpCircle } from "lucide-react"
import type React from "react"
import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Small caption for configurator fields and sections. */
export const MICRO_LABEL = "text-[11px] font-black text-muted-foreground"

/** Help icon whose tooltip explains a field; the label names it for screen readers. */
export function FieldHint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="bare"
          size="bare"
          aria-label={`About ${label}`}
          className="rounded-full text-muted-foreground/60 hover:text-user focus-visible:text-user"
        >
          <HelpCircle className="size-3.5" strokeWidth={2.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">{text}</TooltipContent>
    </Tooltip>
  )
}

interface FieldProps {
  label: string
  icon?: React.ReactNode
  help?: string
  /** Read-only values have nothing to label, so the heading renders as text instead of a <label>. */
  readOnly?: boolean
  className?: string
  children: (id: string) => React.ReactNode
}

/** Labelled configurator field; `children` receives the id to put on the control. */
export function Field({ label, icon, help, readOnly, className, children }: FieldProps) {
  const id = useId()
  const heading = readOnly ? (
    <span className={MICRO_LABEL}>{label}</span>
  ) : (
    <Label htmlFor={id} className={MICRO_LABEL}>
      {label}
    </Label>
  )

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
        {heading}
        {help && <FieldHint label={label} text={help} />}
      </div>
      {children(id)}
    </div>
  )
}

/** Explains why a control is disabled. Disabled buttons fire no pointer events, so the tooltip hangs off a focusable wrapper. */
export function DisabledReason({
  reason,
  className,
  children,
}: {
  reason: string | null
  className?: string
  children: React.ReactElement
}) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus, so this wrapper carries the reason to keyboard users
          tabIndex={0}
          className={cn(
            "rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">{reason}</TooltipContent>
    </Tooltip>
  )
}
