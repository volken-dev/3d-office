import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface InfoBubbleProps {
  text: string
}

/** Question-mark icon with a tooltip, for inline help next to a label. */
export function InfoBubble({ text }: InfoBubbleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="bare"
          size="bare"
          aria-label="More info"
          className="ml-1 rounded-full text-muted-foreground hover:text-user focus-visible:text-user focus-visible:ring-2"
        >
          <HelpCircle className="size-[13px]" strokeWidth={2.5} aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-center">{text}</TooltipContent>
    </Tooltip>
  )
}
