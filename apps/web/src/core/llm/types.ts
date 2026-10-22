export type LLMRole = "system" | "user" | "assistant" | "tool"

export interface LLMMessageMetadata {
  /** Autonomous prompts and system corrections: kept in the model context, hidden from the chat UI. */
  internal?: boolean
  /** Set on the "submitted for review" message so the chat can link to the task. */
  reviewTaskId?: string
  /** The message reports a failed LLM call rather than a model reply. */
  error?: boolean
}

export interface LLMMessage {
  role: LLMRole
  content: string
  name?: string
  tool_calls?: LLMToolCall[]
  metadata?: LLMMessageMetadata
}

export interface LLMToolCall {
  id: string
  type: "function"
  function: {
    name: string
    /** Always a JSON object string (never "undefined"), so it can be replayed safely. */
    arguments: string
  }
  /** Opaque Gemini thought signature; Gemini 3 requires it to be sent back with the call on later turns. */
  thought_signature?: string
}

/** The subset of JSON Schema that Gemini function declarations accept. */
export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null"
  description?: string
  enum?: (string | number)[]
  nullable?: boolean
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
}

export interface LLMToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters?: JsonSchema
  }
}

export interface LLMConfig {
  apiKey: string
  model: string
}

export interface LLMTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LLMResponse {
  content: string | null
  tool_calls?: LLMToolCall[]
  usage?: LLMTokenUsage
  finishReason?: string
  /** Model version reported by the API, used for cost accounting. */
  modelVersion?: string
  responseId?: string
}

export interface LLMCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** Port for anything that can run a chat completion: the browser Gemini SDK today, the Hono API later. */
export interface LLMClient {
  generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName?: string,
    options?: LLMCallOptions,
  ): Promise<LLMResponse>
}
