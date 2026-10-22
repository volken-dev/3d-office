import { AlertTriangle, ChevronRight, GitPullRequest, Trash2 } from "lucide-react"
import React, { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { USER_NAME } from "../data/agents"
import { type Task, type TaskStatus, useCoreStore } from "../integration/store/coreStore"
import { useTeamRoster } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import { selectAgent } from "./components/selectAgent"
import DeleteTaskModal from "./DeleteTaskModal"

/** The viewport child must fill the height so each column scrolls on its own. */
const COLUMNS_FILL_HEIGHT = "[&_[data-slot=scroll-area-viewport]>div]:h-full"

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "scheduled", label: "Scheduled" },
  { status: "on_hold", label: "On hold" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
]

function AgentTag({ agentIndex }: { agentIndex: number }) {
  const { system, byIndex } = useTeamRoster()

  if (agentIndex === system.user.index) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-user">
        <span className="size-1.5 shrink-0 rounded-full bg-user" aria-hidden />
        {USER_NAME}
      </span>
    )
  }

  const agent = byIndex.get(agentIndex)
  if (!agent) return null
  return (
    <Button
      variant="bare"
      size="bare"
      onClick={() => selectAgent(agent.index)}
      aria-label={`Select ${agent.name}`}
      className="rounded text-[11px] font-normal text-muted-foreground hover:text-foreground"
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: agent.color }}
        aria-hidden
      />
      {agent.name}
    </Button>
  )
}

function IconAction({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const TaskCard = React.memo(function TaskCard({ task }: { task: Task }) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const removeTask = useCoreStore((state) => state.removeTask)
  const setActiveAuditTaskId = useUiStore((state) => state.setActiveAuditTaskId)
  const revisionCount = task.revisions?.length ?? 0
  const hasWork = task.status === "done" || !!task.draftOutput || revisionCount > 0
  const title = task.title || "Untitled task"

  return (
    <Collapsible className="group/card space-y-2 rounded-lg border border-black/5 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <CollapsibleTrigger className="flex flex-1 items-start gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <h4 className="flex-1 text-xs leading-snug font-bold text-foreground">{title}</h4>
          <ChevronRight
            size={14}
            className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/card:rotate-90"
            aria-hidden
          />
          <span className="sr-only">Toggle task details</span>
        </CollapsibleTrigger>
        {task.status !== "done" && (
          <IconAction
            label={`Delete ${title}`}
            variant="ghost-destructive"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 />
          </IconAction>
        )}
      </div>

      <CollapsibleContent>
        <p className="rounded border border-black/5 bg-muted/25 p-2 text-xs leading-relaxed text-foreground/80">
          {task.description}
        </p>
      </CollapsibleContent>

      {task.error && task.status !== "done" && (
        <p className="flex items-start gap-1.5 rounded border border-destructive/20 bg-destructive/5 p-2 text-[11px] leading-snug text-destructive">
          <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
          <span className="line-clamp-3">Last attempt failed: {task.error}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-x-2 gap-y-1 pt-1">
        <AgentTag agentIndex={task.assignedAgentId} />
        <div className="flex items-center gap-2">
          {task.status === "in_progress" && (
            <Badge className="border-user/20 bg-user/10 text-[11px] font-black text-user shadow-sm">
              Working
            </Badge>
          )}
          {hasWork && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setActiveAuditTaskId(task.id)}
                  aria-label={`View work details for ${title}`}
                  className="group/audit h-6 gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600"
                >
                  {revisionCount > 0 && (
                    <span className="text-[11px] font-black">{revisionCount}</span>
                  )}
                  <GitPullRequest strokeWidth={2.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View work details</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {task.status !== "done" && (
        <DeleteTaskModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => removeTask(task.id)}
          taskTitle={task.title}
        />
      )}
    </Collapsible>
  )
})

/** The task board: one scrolling column per task status. */
export function KanbanPanel() {
  const tasks = useCoreStore((state) => state.tasks)

  return (
    <section
      aria-label="Tasks"
      className="relative flex h-full w-full flex-col border-t border-black/8 bg-background"
    >
      <ScrollArea className={cn("min-h-0 flex-1 bg-muted/10", COLUMNS_FILL_HEIGHT)}>
        <div className="flex h-full min-w-max gap-4 px-5 py-4">
          {COLUMNS.map(({ status, label }) => {
            const columnTasks = tasks.filter((task) => task.status === status)
            return (
              <div key={status} className="flex w-52 flex-col gap-3">
                <h3 className="flex shrink-0 items-center gap-2 select-none">
                  <span className="text-[11px] leading-none font-black text-muted-foreground">
                    {label}
                  </span>
                  <Badge
                    variant="secondary"
                    className="min-w-5 rounded-md px-1.5 text-[11px] font-bold text-muted-foreground"
                  >
                    {columnTasks.length}
                  </Badge>
                </h3>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {columnTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-input p-4 select-none">
                      <span className="text-[11px] font-bold text-muted-foreground">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  )
}
