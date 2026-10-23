import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import { FolderOpen, GitPullRequest, Lock, MessageSquare, MessageSquareWarning } from "lucide-react"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useChatAvailability } from "../integration/hooks/use-chat-availability"
import { useScene } from "../integration/scene-context"
import { useCoreStore } from "../integration/store/core-store"
import { useUiStore } from "../integration/store/ui-store"

const REVIEW_LABEL = "text-[11px] font-black text-user"

interface InspectorAgentActionsProps {
  agent: AgentNode
  system: AgenticSystem
}

/** The call to action under the agent's name: review requests, chat entry point or the final output. */
export function InspectorAgentActions({ agent, system }: InspectorAgentActionsProps) {
  const isChatting = useUiStore((state) => state.isChatting)
  const setActiveAuditTaskId = useUiStore((state) => state.setActiveAuditTaskId)
  const phase = useCoreStore((state) => state.phase)
  const setFinalOutputOpen = useCoreStore((state) => state.setFinalOutputOpen)
  const taskOnHold = useCoreStore((state) =>
    state.tasks.find((task) => task.assignedAgentId === agent.index && task.status === "on_hold"),
  )
  const scene = useScene()
  const { canChat, reason } = useChatAvailability(agent.index)
  const previousCanChatRef = useRef(canChat)

  const isLead = agent.index === system.leadAgent.index
  const isLeadAgentIdle = isLead && phase === "idle"
  const needsInput = isLeadAgentIdle || !!taskOnHold

  useEffect(() => {
    if (previousCanChatRef.current && !canChat && isChatting) {
      useUiStore.getState().setChatting(false)
    }
    previousCanChatRef.current = canChat
  }, [canChat, isChatting])

  const handleStartChat = () => {
    if (canChat) scene?.startChat()
  }

  if (needsInput && isChatting) {
    return (
      <div className="rounded-xl border border-user/20 bg-user/10 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-4 items-center justify-center rounded bg-user text-user-foreground shadow-sm">
              <MessageSquareWarning size={10} strokeWidth={3} aria-hidden />
            </span>
            <span className={REVIEW_LABEL}>Review requested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            <span className="text-[11px] font-black text-emerald-700">Active</span>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-tight font-bold text-foreground">
          {isLeadAgentIdle ? "Waiting to review user brief." : `${agent.name} needs input.`}
        </p>
      </div>
    )
  }

  if (needsInput) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded-lg border border-user/20 bg-user/10 text-user">
            <MessageSquareWarning size={12} strokeWidth={3} aria-hidden />
          </span>
          <span className={REVIEW_LABEL}>Review requested</span>
        </div>
        <p className="text-xs leading-tight font-bold text-foreground">
          {isLeadAgentIdle
            ? "Review the user brief with the team."
            : `I've finished the task "${taskOnHold?.title ?? "Work"}". I've submitted my work for your review.`}
        </p>
        <Button
          size="cta"
          onClick={
            isLeadAgentIdle ? handleStartChat : () => setActiveAuditTaskId(taskOnHold?.id ?? null)
          }
          disabled={isLeadAgentIdle && !canChat}
          className="mt-1 h-11 shadow-sm"
        >
          {isLeadAgentIdle ? <MessageSquare strokeWidth={3} /> : <GitPullRequest strokeWidth={3} />}
          {isLeadAgentIdle ? "Chat about the brief" : "Review task"}
        </Button>
      </div>
    )
  }

  if (agent.index === system.user.index || isChatting) return null

  if (isLead && phase === "done") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-yellow-400" aria-hidden />
          <span className="text-[11px] font-black text-yellow-800">Project ready</span>
        </div>
        <Button
          size="cta"
          onClick={() => setFinalOutputOpen(true)}
          className="h-10 w-full bg-yellow-400 text-black shadow-sm hover:bg-yellow-300"
        >
          <FolderOpen strokeWidth={3} />
          View final output
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="cta"
      onClick={handleStartChat}
      disabled={!canChat}
      className="h-10 w-full shadow-md disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
    >
      {canChat ? <MessageSquare /> : <Lock className="opacity-60" />}
      {canChat ? "Open chat" : reason}
    </Button>
  )
}
