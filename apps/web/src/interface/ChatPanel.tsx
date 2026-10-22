import type { AgentMessage } from "@the-delegation/agents/llm/types"
import { useEffect, useMemo, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCoreStore } from "../integration/store/coreStore"
import { useTeamRoster } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import { useSceneManager } from "../simulation/SceneContext"
import { ChatInput } from "./ChatInput"
import { ChatMessage } from "./ChatMessage"
import { avatarTypeFor } from "./components/Avatar"
import { SCROLL_AREA_BLOCK } from "./components/styles"

const NO_MESSAGES: AgentMessage[] = []

function ThinkingIndicator({ agentName }: { agentName: string }) {
  return (
    <div role="status" className="flex items-start gap-3">
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="mt-1 size-4 animate-pulse text-zinc-300"
        aria-hidden
      >
        <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" />
      </svg>
      <div className="flex gap-1 rounded-2xl rounded-tl-none bg-muted/50 px-4 py-3" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-zinc-300"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <span className="sr-only">{agentName} is thinking…</span>
    </div>
  )
}

/** Conversation with the selected agent, shown while the user is chatting with it. */
function ChatPanel() {
  const { isChatting, isThinking, selectedNpcIndex } = useUiStore(
    useShallow((state) => ({
      isChatting: state.isChatting,
      isThinking: state.isThinking,
      selectedNpcIndex: state.selectedNpcIndex,
    })),
  )
  const scene = useSceneManager()
  const { system: activeTeam, byIndex } = useTeamRoster()
  const agent = selectedNpcIndex !== null ? byIndex.get(selectedNpcIndex) : undefined
  const history =
    useCoreStore((state) =>
      selectedNpcIndex !== null ? state.agentHistories[selectedNpcIndex] : undefined,
    ) ?? NO_MESSAGES
  const messages = useMemo(
    () => history.filter((message) => !message.metadata?.internal),
    [history],
  )
  const scrollRootRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run to scroll to the bottom when a message or the thinking indicator appears
  useEffect(() => {
    if (!isChatting) return
    const frame = requestAnimationFrame(() => {
      const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
        "[data-slot=scroll-area-viewport]",
      )
      viewport?.scrollTo({ top: viewport.scrollHeight })
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, isThinking, isChatting])

  if (!isChatting || !agent) return null

  const avatarType = avatarTypeFor(activeTeam, agent.index)

  return (
    <div className="relative flex h-full shrink-0 flex-col overflow-hidden bg-background">
      <ScrollArea ref={scrollRootRef} className={cn("min-h-0 flex-1", SCROLL_AREA_BLOCK)}>
        <ol
          role="log"
          aria-live="polite"
          aria-label={`Conversation with ${agent.name}`}
          className="space-y-6 p-1"
        >
          {messages.map((message, messageIndex) => (
            <ChatMessage
              // biome-ignore lint/suspicious/noArrayIndexKey: chat history is append-only, so a message's position is its identity
              key={messageIndex}
              message={message}
              agentName={agent.name}
              agentColor={agent.color}
              agentAvatar={avatarType}
            />
          ))}
        </ol>
        {isThinking && (
          <div className="p-1 pt-6">
            <ThinkingIndicator agentName={agent.name} />
          </div>
        )}
      </ScrollArea>

      <ChatInput
        agentName={agent.name}
        agentColor={agent.color}
        disabled={isThinking}
        onSend={(text) => void scene?.sendMessage(text)}
      />
    </div>
  )
}

export default ChatPanel
