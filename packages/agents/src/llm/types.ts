import type {
  ContentBlock,
  MessagesRequest,
  MessagesResponse,
} from "@the-delegation/shared/llm-messages"

export interface AgentMessageMetadata {
  /** Autonomous prompts, project context and tool results: sent to the model, hidden from the chat UI. */
  internal?: boolean
  /** A snapshot of the project context; a new one is appended only when the context changed. */
  context?: boolean
  /** Shown in the chat but never sent to the model (error notices, review notices). */
  displayOnly?: boolean
  /** Set on the "submitted for review" notice so the chat can link to the task. */
  reviewTaskId?: string
  /** The message reports a failed LLM call rather than a model reply. */
  error?: boolean
}

/**
 * One turn in an agent's history: provider-neutral content blocks plus UI metadata. Assistant turns hold the
 * model's blocks exactly as returned (including opaque reasoning), so they can be replayed unchanged.
 */
export interface AgentMessage {
  role: "user" | "assistant"
  content: ContentBlock[]
  metadata?: AgentMessageMetadata
}

export interface LLMCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** Port for whatever serves model calls: the Hono gateway from the browser, or the router on a server. */
export interface LLMClient {
  complete(request: MessagesRequest, options?: LLMCallOptions): Promise<MessagesResponse>
}
