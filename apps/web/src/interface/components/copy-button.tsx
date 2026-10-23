import { Check, Copy } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { copyToClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  /** Built only on click, so large payloads are never serialized during render. */
  getText: () => string
  label?: string
  className?: string
}

/** Icon button that copies text and briefly shows a check mark. */
export function CopyButton({ getText, label = "Text", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!(await copyToClipboard(getText(), label))) return
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      aria-label={`Copy ${label.toLowerCase()}`}
      className={cn(
        copied ? "text-success" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}
