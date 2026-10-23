import { Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useUiStore } from "../integration/store/ui-store"

/** How long after the last keystroke the player's typing animation keeps playing. */
const TYPING_IDLE_MS = 1000

/** Every uiStore write notifies the scene subscribers, so only write when the flag actually flips. */
function setTyping(isTyping: boolean) {
  const store = useUiStore.getState()
  if (store.isTyping !== isTyping) store.setIsTyping(isTyping)
}

interface ChatInputProps {
  agentName: string
  agentColor: string
  disabled: boolean
  onSend: (text: string) => void
}

/** Owns the draft so keystrokes never re-render the message list. */
export function ChatInput({ agentName, agentColor, disabled, onSend }: ChatInputProps) {
  const [input, setInput] = useState("")
  const stopTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canSend = input.trim().length > 0 && !disabled

  useEffect(
    () => () => {
      if (stopTypingRef.current) clearTimeout(stopTypingRef.current)
    },
    [],
  )

  const handleChange = (value: string) => {
    setInput(value)
    if (stopTypingRef.current) clearTimeout(stopTypingRef.current)
    if (value.length === 0) {
      setTyping(false)
      return
    }
    setTyping(true)
    stopTypingRef.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS)
  }

  const handleSend = () => {
    if (!canSend) return
    if (stopTypingRef.current) clearTimeout(stopTypingRef.current)
    setTyping(false)
    const text = input
    setInput("")
    onSend(text)
  }

  return (
    <div className="border-t border-border p-2">
      <div className="flex items-center gap-2">
        <Textarea
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          aria-label={`Message ${agentName}`}
          aria-describedby="chat-input-hint"
          placeholder="Message (↵ to send)"
          rows={1}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border-input bg-background px-3 py-3 text-sm shadow-none focus-visible:border-user focus-visible:ring-user/20"
        />
        <Button
          size="icon-lg"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          style={canSend ? { backgroundColor: agentColor } : undefined}
          className="size-11 rounded-2xl text-white shadow-lg hover:brightness-90 active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
        >
          <Send strokeWidth={3} />
        </Button>
      </div>
      <p
        id="chat-input-hint"
        className="mt-2 text-center text-[11px] font-medium text-muted-foreground"
      >
        Shift + ↵ for new line
      </p>
    </div>
  )
}
