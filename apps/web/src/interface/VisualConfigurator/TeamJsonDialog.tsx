import { Braces, Copy } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { copyToClipboard } from "@/lib/clipboard"
import type { AgenticSystem } from "../../data/agents"

/** Shows the saved team definition as JSON, with a copy button, so a team can be shared or backed up. */
export function TeamJsonDialog({ system }: { system: AgenticSystem }) {
  const json = useMemo(() => JSON.stringify(system, null, 2), [system])

  const handleCopy = () => void copyToClipboard(json, "Team JSON")

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-[11px] font-black text-muted-foreground"
        >
          <Braces />
          Export JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{system.teamName || "Untitled team"}</DialogTitle>
          <DialogDescription>
            The saved team definition, including every agent and its layout.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 rounded-xl bg-primary">
          <pre className="whitespace-pre-wrap p-6 font-mono text-xs text-primary-foreground">
            {json}
          </pre>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={handleCopy}>
            <Copy />
            Copy JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
