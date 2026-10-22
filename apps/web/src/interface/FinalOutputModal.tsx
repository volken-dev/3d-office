import { Copy } from "lucide-react"
import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { copyToClipboard } from "@/lib/clipboard"
import { useCoreStore } from "../integration/store/coreStore"
import { useActiveTeam } from "../integration/store/teamStore"
import { TeamOutputBadge } from "./components/TeamOutputBadge"

function formatFinalizedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

/** Read-only view of the approved deliverable, with a way to copy it out. */
export function FinalOutputModal() {
  const isFinalOutputOpen = useCoreStore((state) => state.isFinalOutputOpen)
  const setFinalOutputOpen = useCoreStore((state) => state.setFinalOutputOpen)
  const finalOutput = useCoreStore((state) => state.finalOutput)
  const finalizedAt = useCoreStore((state) => state.finalizedAt)
  const activeTeam = useActiveTeam()

  return (
    <Dialog open={isFinalOutputOpen} onOpenChange={setFinalOutputOpen}>
      <DialogContent className="flex max-h-[90dvh] w-[45rem] flex-col gap-0 overflow-hidden rounded-3xl bg-muted/40 p-0 sm:max-w-[45rem]">
        <DialogHeader className="flex-row items-center gap-6 border-b border-border bg-background px-8 py-6 pr-14 text-left">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-black">Final deliverable</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Refined and produced by your autonomous team
              {finalizedAt !== null && <> on {formatFinalizedAt(finalizedAt)}</>}
            </DialogDescription>
          </div>
          <TeamOutputBadge system={activeTeam} className="hidden sm:flex" />
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <Markdown className="px-8 py-8 text-sm leading-relaxed text-foreground">
            {finalOutput || ""}
          </Markdown>
        </ScrollArea>

        <DialogFooter className="border-t border-border bg-background px-8 py-6">
          <Button
            onClick={() => void copyToClipboard(finalOutput || "", "Deliverable")}
            size="lg"
            className="h-11 rounded-2xl px-6 text-xs font-black shadow-lg shadow-black/10"
          >
            <Copy />
            Copy output
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
