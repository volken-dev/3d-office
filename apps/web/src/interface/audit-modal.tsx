import { AlertCircle, CheckCircle2, GitPullRequest } from "lucide-react"
import { useState } from "react"
import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getAgentByIndex } from "../data/agents"
import { useCoreStore } from "../integration/store/core-store"
import { useActiveTeam } from "../integration/store/team-store"
import { useUiStore } from "../integration/store/ui-store"
import { Avatar } from "./components/avatar"
import { InfoBubble } from "./components/info-bubble"

interface AuditModalProps {
  taskId: string
  isOpen?: boolean
  onClose: () => void
}

const LATEST = "latest"

function formatRevisionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/** Review dialog for one task: approve it, reject it with feedback, or browse its earlier versions. */
export function AuditModal({ taskId, isOpen = true, onClose }: AuditModalProps) {
  const task = useCoreStore((state) => state.tasks.find((candidate) => candidate.id === taskId))
  const approveTask = useCoreStore((state) => state.approveTask)
  const rejectTask = useCoreStore((state) => state.rejectTask)
  const setSelectedNpc = useUiStore((state) => state.setSelectedNpc)
  const setChatting = useUiStore((state) => state.setChatting)
  const activeTeam = useActiveTeam()
  const [feedback, setFeedback] = useState("")
  const [selectedRevision, setSelectedRevision] = useState<string>(LATEST)

  if (!task) return null

  const isViewMode = task.status === "done"
  const hasRevisions = task.revisions.length > 0
  const revisionIndex = selectedRevision === LATEST ? null : Number(selectedRevision)
  const hasFeedback = feedback.trim().length > 0
  const agent = getAgentByIndex(activeTeam, task.assignedAgentId)

  const content =
    revisionIndex !== null
      ? task.revisions[revisionIndex].output
      : isViewMode
        ? ((task.output || task.draftOutput) ?? "")
        : task.draftOutput || "No content produced."

  const contentLabel =
    revisionIndex !== null
      ? `Revision V${revisionIndex + 1}`
      : isViewMode
        ? "Final output"
        : "Current proposal"

  const finish = () => {
    setSelectedNpc(null)
    setChatting(false)
    onClose()
  }

  const handleApprove = () => {
    approveTask(taskId)
    finish()
  }

  const handleReject = () => {
    if (!hasFeedback) return
    rejectTask(taskId, feedback)
    finish()
  }

  const showLatest = () => setSelectedRevision(LATEST)

  /** A stray click outside must not throw away a half-written rejection note. */
  const keepHalfWrittenFeedback = (event: Event) => {
    if (hasFeedback) event.preventDefault()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl"
        onInteractOutside={keepHalfWrittenFeedback}
      >
        <DialogHeader className="flex-row items-center gap-6 px-8 py-8 pr-14 text-left">
          <div className="relative shrink-0">
            <Avatar
              type={agent?.index === activeTeam.user.index ? "user" : "sub"}
              color={agent?.color}
              size={64}
            />
            <div
              className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-4 border-background"
              style={{ backgroundColor: agent?.color || "var(--primary)" }}
            >
              <div className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black">{agent?.name}</span>
              {isViewMode ? (
                <Badge className="bg-success/15 text-xs font-bold text-emerald-700">
                  Completed work
                </Badge>
              ) : (
                <Badge className="bg-user/15 text-xs font-bold text-blue-700">
                  Requires review
                </Badge>
              )}
            </div>
            <DialogTitle className="text-2xl font-semibold leading-tight tracking-tight">
              {task.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isViewMode
                ? "Read the completed output of this task."
                : "Approve this task or reject it with feedback for the agent."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex gap-6 px-6 pb-6">
            <section
              className={`min-w-0 flex-1 space-y-4 ${hasRevisions ? "border-r border-border pr-6" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-1 rounded-full bg-primary" />
                  <h3 className="text-xs font-black text-muted-foreground">{contentLabel}</h3>
                </div>
                {revisionIndex !== null && (
                  <Button
                    variant="link"
                    size="xs"
                    className="text-xs font-black text-muted-foreground"
                    onClick={showLatest}
                  >
                    Back to latest
                  </Button>
                )}
              </div>
              <div className="min-h-[350px] rounded-3xl border border-border bg-muted/30 p-8 shadow-inner">
                <Markdown className="text-sm leading-relaxed text-foreground">{content}</Markdown>
              </div>
            </section>

            {hasRevisions && (
              <aside className="sticky top-0 flex w-56 shrink-0 flex-col self-start pt-4">
                <div className="mb-4 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-user motion-safe:animate-pulse" />
                  <span id="audit-versions-label" className="text-xs font-black">
                    Version history
                  </span>
                  <InfoBubble text="View previous iterations of this task. You can see how the work evolved or revert to a stronger version." />
                </div>
                <ToggleGroup
                  type="single"
                  value={selectedRevision}
                  onValueChange={(value) => value && setSelectedRevision(value)}
                  spacing={2}
                  aria-labelledby="audit-versions-label"
                  className="max-h-[55vh] w-full flex-col items-stretch overflow-y-auto pr-1"
                >
                  {task.revisions.map((revision, versionIndex) => (
                    <ToggleGroupItem
                      key={revision.timestamp}
                      value={String(versionIndex)}
                      variant="outline"
                      className="h-auto flex-col items-stretch gap-1 rounded-xl p-2.5 text-left whitespace-normal hover:bg-muted data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      <span className="flex items-center justify-between text-xs">
                        <span className="font-black">Version {versionIndex + 1}</span>
                        <span className="font-bold opacity-60">
                          {formatRevisionTime(revision.timestamp)}
                        </span>
                      </span>
                      {revision.feedback && (
                        <span className="line-clamp-2 text-xs italic leading-tight opacity-75">
                          &ldquo;{revision.feedback}&rdquo;
                        </span>
                      )}
                    </ToggleGroupItem>
                  ))}
                  {!isViewMode && (
                    <ToggleGroupItem
                      value={LATEST}
                      variant="outline"
                      className="mt-2 h-auto flex-col items-stretch gap-1 rounded-xl p-3 text-left whitespace-normal hover:border-success/40 hover:bg-success/5 data-[state=on]:border-success/30 data-[state=on]:bg-success/10 data-[state=on]:text-emerald-700"
                    >
                      <span className="text-xs font-black text-emerald-700">Active review</span>
                      <span className="text-xs font-medium text-emerald-600">
                        In review process…
                      </span>
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
              </aside>
            )}
          </div>
        </ScrollArea>

        {!isViewMode && revisionIndex === null && (
          <div className="grid gap-2 border-t border-border px-8 py-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitPullRequest className="size-3.5" />
              <Label htmlFor="audit-feedback" className="text-xs font-black">
                Your feedback
              </Label>
              <InfoBubble text="Provide specific instructions for what to change. The agent will read this and attempt a new version." />
            </div>
            <Textarea
              id="audit-feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Describe what needs to be changed…"
              aria-describedby="audit-feedback-help"
              className="field-sizing-fixed h-20 resize-none rounded-xl bg-muted/40 text-[13px] placeholder:italic"
            />
            <p id="audit-feedback-help" className="text-xs text-muted-foreground">
              Feedback is required to request changes.
            </p>
          </div>
        )}

        <DialogFooter className="shrink-0 gap-4 border-t border-border bg-muted/30 px-8 py-6">
          {isViewMode || revisionIndex !== null ? (
            <Button
              size="lg"
              onClick={revisionIndex !== null ? showLatest : onClose}
              className="h-12 rounded-2xl px-10 text-xs font-black shadow-xl shadow-primary/10"
            >
              {revisionIndex !== null ? "Show active review" : "Close viewer"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReject}
                disabled={!hasFeedback}
                aria-describedby="audit-feedback-help"
                className="h-12 rounded-2xl px-8 text-xs font-black"
              >
                <AlertCircle strokeWidth={3} />
                Reject with feedback
              </Button>
              <Button
                size="lg"
                onClick={handleApprove}
                className="h-12 rounded-2xl px-10 text-xs font-black shadow-xl shadow-primary/10"
              >
                <CheckCircle2 strokeWidth={3} />
                Approve task
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
