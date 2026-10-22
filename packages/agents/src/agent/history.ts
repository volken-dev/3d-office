import type { ContentBlock, Message, ToolCallBlock } from "@the-delegation/shared/llm-messages"
import type { AgentMessage } from "../llm/types"

/**
 * The conversation the model sees: every stored turn except display-only notices, unchanged and in order. History
 * is append-only, so each request's prefix matches the previous one and stays cached.
 */
export function toRequestMessages(history: readonly AgentMessage[]): Message[] {
  return history.flatMap((message) =>
    message.metadata?.displayOnly || message.content.length === 0
      ? []
      : [{ role: message.role, content: message.content }],
  )
}

/** The text of the most recent project-context snapshot in this history, if any. */
export function lastContextText(history: readonly AgentMessage[]): string | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]
    if (!message?.metadata?.context) continue
    const block = message.content[0]
    return block?.type === "text" ? block.text : undefined
  }
  return undefined
}

/** The text blocks of a turn, joined. */
export function blockText(content: readonly ContentBlock[]): string {
  return content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n\n")
    .trim()
}

/** The tool calls in a turn, in order. */
export function toolCallsIn(content: readonly ContentBlock[]): ToolCallBlock[] {
  return content.filter((block): block is ToolCallBlock => block.type === "tool_call")
}

/** What the chat shows for a turn: its text, or a short note when the model only called tools. */
export function displayTextOf(message: AgentMessage): string {
  const text = blockText(message.content)
  if (text) return text
  const toolCalls = toolCallsIn(message.content)
  if (toolCalls.length === 0) return "..."
  return toolCalls.some((block) => block.name === "set_user_brief")
    ? "Project brief set. Let's begin."
    : "Working on it..."
}

function isSafeStart(message: AgentMessage): boolean {
  return message.role === "user" && !message.content.some((block) => block.type === "tool_result")
}

/**
 * Appends a turn and, past `maxMessages`, drops the oldest turns until the history fits and starts with a user
 * turn that is not a tool result. Trimming at that boundary never separates a tool call from its result, which
 * Claude would reject; it costs one prompt-cache miss when it happens.
 */
export function appendToHistory(
  history: readonly AgentMessage[],
  message: AgentMessage,
  maxMessages: number,
): AgentMessage[] {
  const next = [...history, message]
  if (next.length <= maxMessages) return next
  let start = next.length - maxMessages
  while (start < next.length - 1) {
    const candidate = next[start]
    if (candidate && isSafeStart(candidate)) break
    start++
  }
  return next.slice(start)
}
