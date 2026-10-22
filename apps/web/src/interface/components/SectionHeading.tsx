import type React from "react"
import { cn } from "@/lib/utils"
import { EYEBROW } from "./styles"

interface SectionHeadingProps {
  label: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/** Section caption with a hairline rule filling the rest of the row and an optional trailing action. */
export function SectionHeading({ label, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <h3 className={EYEBROW}>{label}</h3>
      <div className="h-px flex-1 bg-border" aria-hidden />
      {action}
    </div>
  )
}
