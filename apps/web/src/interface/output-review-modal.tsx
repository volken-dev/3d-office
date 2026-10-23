import { Check, FileText, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useScene } from "../integration/scene-context"
import { useCoreStore } from "../integration/store/core-store"
import { useActiveTeam } from "../integration/store/team-store"

const REVIEW_TOAST_ID = "deliverable-review"

/**
 * Lets the user edit and approve the lead's final deliverable. The draft reloads from the store
 * whenever the review (re)opens or the lead revises it.
 */
export function OutputReviewModal() {
  const isReviewingOutput = useCoreStore((state) => state.isReviewingOutput)
  const setReviewingOutput = useCoreStore((state) => state.setReviewingOutput)
  const pendingDeliverable = useCoreStore((state) => state.pendingOutputPrompt)
  const setPendingDeliverable = useCoreStore((state) => state.setPendingOutputPrompt)
  const finalizeOutput = useCoreStore((state) => state.finalizeOutput)
  const resetProject = useCoreStore((state) => state.resetProject)

  const activeTeam = useActiveTeam()
  const scene = useScene()
  const [draft, setDraft] = useState(pendingDeliverable)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)

  const draftSource = isReviewingOutput ? pendingDeliverable : null
  const [syncedSource, setSyncedSource] = useState<string | null>(null)
  if (draftSource !== syncedSource) {
    setSyncedSource(draftSource)
    if (draftSource !== null) {
      setDraft(draftSource)
      setIsConfirmingReset(false)
    }
  }

  useEffect(() => {
    if (isReviewingOutput || !pendingDeliverable) toast.dismiss(REVIEW_TOAST_ID)
  }, [isReviewingOutput, pendingDeliverable])

  /** Closing is non-destructive: keep the edited draft and offer a way back in. */
  const reviewLater = () => {
    setPendingDeliverable(draft)
    setReviewingOutput(false)
    toast("Final deliverable is waiting for your review", {
      id: REVIEW_TOAST_ID,
      duration: Infinity,
      action: { label: "Review", onClick: () => setReviewingOutput(true) },
    })
  }

  const confirmReset = () => {
    scene?.resetScene()
    resetProject()
  }

  return (
    <>
      <Dialog open={isReviewingOutput} onOpenChange={(open) => !open && reviewLater()}>
        <DialogContent
          className="flex max-h-[90dvh] w-[45rem] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[45rem]"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="flex-row items-center gap-4 border-b border-border px-8 py-6 pr-14 text-left">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <FileText className="size-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-black">Review final deliverable</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                {activeTeam.teamName} has synthesized its work. Edit it as needed; once approved,
                the project is marked complete.
              </DialogDescription>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 bg-muted/30">
            <div className="space-y-3 px-8 py-8">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="deliverable-draft"
                  className="text-xs font-black text-muted-foreground"
                >
                  Deliverable
                </Label>
                <Badge variant="secondary" className="text-[11px] font-bold text-muted-foreground">
                  Editable Markdown
                </Badge>
              </div>
              <Textarea
                id="deliverable-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="field-sizing-fixed h-72 resize-none rounded-2xl bg-background p-4 font-mono text-sm leading-relaxed shadow-sm"
                placeholder="Final deliverable (Markdown)..."
              />
            </div>
          </ScrollArea>

          <DialogFooter className="items-center gap-3 border-t border-border px-8 py-6 sm:justify-between">
            <Button
              variant="ghost-destructive"
              onClick={() => setIsConfirmingReset(true)}
              className="rounded-2xl text-xs font-black"
            >
              <RotateCcw />
              Discard run
            </Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="outline"
                size="lg"
                onClick={reviewLater}
                className="h-11 rounded-2xl px-6 text-xs font-black"
              >
                Review later
              </Button>
              <Button
                size="lg"
                onClick={() => finalizeOutput(draft)}
                className="h-11 rounded-2xl px-8 text-xs font-black shadow-lg shadow-black/10"
              >
                <Check strokeWidth={3} />
                Approve & deliver
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isConfirmingReset}
        onOpenChange={setIsConfirmingReset}
        icon={<RotateCcw />}
        title="Discard this run?"
        description="All progress will be lost and the project will reset to its initial state. This cannot be undone."
        confirmLabel="Discard run"
        cancelLabel="Keep reviewing"
        onConfirm={confirmReset}
      />
    </>
  )
}
