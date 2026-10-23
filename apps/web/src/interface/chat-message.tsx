import { displayTextOf } from "@the-delegation/agents/agent/history"
import type { AgentMessage } from "@the-delegation/agents/llm/types"
import { FileSearch } from "lucide-react"
import React from "react"
import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCoreStore } from "../integration/store/coreStore"
import { useUiStore } from "../integration/store/uiStore"
import { USER_COLOR } from "../theme/brand"
import { Avatar, type AvatarType } from "./components/Avatar"

function ReviewTaskCallout({ taskId }: { taskId: string }) {
  const isPending = useCoreStore(
    (state) => state.tasks.find((task) => task.id === taskId)?.status === "on_hold",
  )
  const setActiveAuditTaskId = useUiStore((state) => state.setActiveAuditTaskId)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-input/50 bg-background/50 p-4">
      <div className="flex items-center gap-2 pr-2">
        <div className="shrink-0 rounded-xl bg-user/10 p-2 text-user">
          <FileSearch size={18} aria-hidden />
        </div>
        <span className="text-[11px] font-black text-foreground/80">
          {isPending ? "Review requested" : "Review processed"}
        </span>
      </div>
      {isPending && (
        <Button
          size="cta"
          onClick={() => setActiveAuditTaskId(taskId)}
          className="h-8 min-w-[120px] flex-1 px-3 text-[11px]"
        >
          Review task
        </Button>
      )}
    </div>
  )
}

interface ChatMessageProps {
  message: AgentMessage
  agentName: string
  agentColor: string
  agentAvatar: AvatarType
}

/** One chat bubble: user text verbatim, model replies through Markdown with a review link when the reply asks for one. */
export const ChatMessage = React.memo(function ChatMessage({
  message,
  agentName,
  agentColor,
  agentAvatar,
}: ChatMessageProps) {
  const isUser = message.role === "user"
  const isError = !!message.metadata?.error
  const reviewTaskId: string | undefined = message.metadata?.reviewTaskId

  return (
    <li className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "flex max-w-[90%] items-start gap-4",
          isUser ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div className="mt-1 shrink-0">
          {isUser ? (
            <Avatar type="user" color={USER_COLOR} size={32} />
          ) : (
            <Avatar type={agentAvatar} color={agentColor} size={32} />
          )}
        </div>

        <div className={cn("flex min-w-0 flex-col", isUser ? "items-end" : "items-start")}>
          <div
            className={cn(
              "rounded-[20px] border px-4 py-2.5 text-sm leading-relaxed break-words text-foreground shadow-sm",
              isUser
                ? "rounded-tr-none border-user/20 bg-user/10"
                : "rounded-tl-none border-border bg-muted/50",
              isError && "border-destructive/30 bg-destructive/5 text-destructive",
            )}
            role={isError ? "alert" : undefined}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{displayTextOf(message)}</div>
            ) : (
              <>
                <Markdown>{displayTextOf(message)}</Markdown>
                {reviewTaskId && <ReviewTaskCallout taskId={reviewTaskId} />}
              </>
            )}
          </div>
          <span className="mt-2 px-1 text-[11px] font-black text-muted-foreground">
            {isUser ? "You" : agentName.split(" ")[0] || "AI"}
          </span>
        </div>
      </div>
    </li>
  )
})
