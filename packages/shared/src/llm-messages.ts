import { z } from "zod"

/**
 * Wire contract for `POST /api/llm/messages`: provider-neutral content-block messages that the gateway
 * maps onto Anthropic (first-class) or OpenAI (outage backup). Every string, array and opaque payload is
 * capped so one request has a bounded cost to validate and to send upstream.
 */
export const LLM_MESSAGES_LIMITS = {
  maxBodyBytes: 1024 * 1024,
  maxMessages: 400,
  maxBlocksPerMessage: 64,
  maxTextChars: 100_000,
  maxSystemChars: 32_000,
  maxTools: 32,
  maxReasoningPayloadChars: 200_000,
  maxOutputTokens: 64_000,
} as const

export const LLM_PROVIDERS = ["anthropic", "openai"] as const
export const LlmProviderSchema = z.enum(LLM_PROVIDERS)
export type LlmProvider = z.infer<typeof LlmProviderSchema>

/** Reasoning effort; adapters translate it for the serving model, and models without effort ignore it. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const
export const EffortSchema = z.enum(EFFORT_LEVELS)
export type Effort = z.infer<typeof EffortSchema>

/** Model ids are checked against the gateway's registry; the contract only bounds their shape. */
export const ModelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "Invalid model id")

const ToolNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/, "Invalid tool name")

const ToolCallIdSchema = z.string().min(1).max(128)

/** JSON Schema subset accepted for tool inputs; `additionalProperties: false` is required for strict tools. */
export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null"
  description?: string
  enum?: (string | number)[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchema
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
}

/** Recursive, size-capped validator for tool input schemas. Unknown keywords are stripped. */
export const JsonSchemaSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    type: z.enum(["string", "number", "integer", "boolean", "array", "object", "null"]).optional(),
    description: z.string().max(2000).optional(),
    enum: z
      .array(z.union([z.string().max(256), z.number()]))
      .max(100)
      .optional(),
    properties: z.record(z.string().max(64), JsonSchemaSchema).optional(),
    required: z.array(z.string().max(64)).max(64).optional(),
    additionalProperties: z.boolean().optional(),
    items: JsonSchemaSchema.optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
  }),
)

export const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(LLM_MESSAGES_LIMITS.maxTextChars),
})

/** A tool call the model made. `input` is already a parsed object, never a JSON string. */
export const ToolCallBlockSchema = z.object({
  type: z.literal("tool_call"),
  id: ToolCallIdSchema,
  name: ToolNameSchema,
  input: z.record(z.string(), z.unknown()),
})

/** The answer to one tool call, matched by `toolCallId`. Failures are results with `isError`, never omitted. */
export const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolCallId: ToolCallIdSchema,
  content: z.string().max(LLM_MESSAGES_LIMITS.maxTextChars),
  isError: z.boolean(),
})

/**
 * Provider-opaque reasoning (Claude thinking blocks, OpenAI reasoning items). Replayed unchanged to the
 * provider that produced it and dropped by the gateway when another provider serves the request.
 */
export const ReasoningBlockSchema = z.object({
  type: z.literal("reasoning"),
  provider: LlmProviderSchema,
  payload: z
    .unknown()
    .refine(
      (payload) =>
        JSON.stringify(payload ?? null).length <= LLM_MESSAGES_LIMITS.maxReasoningPayloadChars,
      "Reasoning payload is too large",
    ),
})

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ToolCallBlockSchema,
  ToolResultBlockSchema,
  ReasoningBlockSchema,
])
export type TextBlock = z.infer<typeof TextBlockSchema>
export type ToolCallBlock = z.infer<typeof ToolCallBlockSchema>
export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>
export type ReasoningBlock = z.infer<typeof ReasoningBlockSchema>
export type ContentBlock = z.infer<typeof ContentBlockSchema>

const BLOCKS_ALLOWED_BY_ROLE: Record<"user" | "assistant", ReadonlySet<ContentBlock["type"]>> = {
  user: new Set(["text", "tool_result"]),
  assistant: new Set(["text", "tool_call", "reasoning"]),
}

/** A conversation turn. Tool calls and reasoning come only from the assistant; tool results only from the user. */
export const MessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.array(ContentBlockSchema).min(1).max(LLM_MESSAGES_LIMITS.maxBlocksPerMessage),
  })
  .superRefine((message, context) => {
    message.content.forEach((block, blockIndex) => {
      if (!BLOCKS_ALLOWED_BY_ROLE[message.role].has(block.type)) {
        context.addIssue({
          code: "custom",
          path: ["content", blockIndex, "type"],
          message: `${block.type} blocks are not allowed in ${message.role} messages`,
        })
      }
    })
  })
export type Message = z.infer<typeof MessageSchema>

export const ToolDefinitionSchema = z.object({
  name: ToolNameSchema,
  description: z.string().max(2000),
  inputSchema: JsonSchemaSchema,
})
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>

/** One tool-pairing problem in a conversation, located by message index. */
export interface ToolPairingIssue {
  messageIndex: number
  message: string
}

/**
 * Checks the tool-use contract both providers enforce: every tool call in an assistant message is answered by
 * a tool result with the same id in the very next user message, and every tool result answers a call from
 * the assistant message right before it. A trailing assistant message with calls is unanswered too.
 */
export function findToolPairingIssues(messages: readonly Message[]): ToolPairingIssue[] {
  const issues: ToolPairingIssue[] = []
  messages.forEach((message, messageIndex) => {
    if (message.role === "assistant") {
      const callIds = message.content.flatMap((block) =>
        block.type === "tool_call" ? [block.id] : [],
      )
      if (callIds.length === 0) return
      const next = messages[messageIndex + 1]
      const answered = new Set(
        next?.role === "user"
          ? next.content.flatMap((block) =>
              block.type === "tool_result" ? [block.toolCallId] : [],
            )
          : [],
      )
      for (const callId of callIds) {
        if (!answered.has(callId)) {
          issues.push({
            messageIndex,
            message: `Tool call "${callId}" has no tool result in the next user message`,
          })
        }
      }
      return
    }

    const previous = messages[messageIndex - 1]
    const callIds = new Set(
      previous?.role === "assistant"
        ? previous.content.flatMap((block) => (block.type === "tool_call" ? [block.id] : []))
        : [],
    )
    for (const block of message.content) {
      if (block.type === "tool_result" && !callIds.has(block.toolCallId)) {
        issues.push({
          messageIndex,
          message: `Tool result "${block.toolCallId}" does not answer a call from the previous assistant message`,
        })
      }
    }
  })
  return issues
}

/** Body of `POST /api/llm/messages`. The conversation must start with the user and keep tool calls paired. */
export const MessagesRequestSchema = z
  .object({
    model: ModelIdSchema,
    system: z.string().max(LLM_MESSAGES_LIMITS.maxSystemChars),
    messages: z.array(MessageSchema).min(1).max(LLM_MESSAGES_LIMITS.maxMessages),
    tools: z.array(ToolDefinitionSchema).max(LLM_MESSAGES_LIMITS.maxTools).optional(),
    effort: EffortSchema.optional(),
    maxOutputTokens: z
      .number()
      .int()
      .positive()
      .max(LLM_MESSAGES_LIMITS.maxOutputTokens)
      .optional(),
  })
  .superRefine((request, context) => {
    if (request.messages[0]?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages", 0, "role"],
        message: "The first message must come from the user",
      })
    }
    for (const issue of findToolPairingIssues(request.messages)) {
      context.addIssue({
        code: "custom",
        path: ["messages", issue.messageIndex],
        message: issue.message,
      })
    }
  })
export type MessagesRequest = z.infer<typeof MessagesRequestSchema>

/** Why generation stopped, normalised across providers. `refusal` means the model declined; check it first. */
export const STOP_REASONS = [
  "end_turn",
  "tool_use",
  "max_tokens",
  "refusal",
  "pause",
  "other",
] as const
export const StopReasonSchema = z.enum(STOP_REASONS)
export type StopReason = z.infer<typeof StopReasonSchema>

/**
 * Token counts for one call. The classes are disjoint: `inputTokens` is uncached input only, so adapters
 * whose provider counts cached tokens inside its input total (OpenAI) subtract them.
 */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
})
export type Usage = z.infer<typeof UsageSchema>

/** Which provider and model produced the response; `fallback` is true when the requested provider failed over. */
export const ServedBySchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().max(128),
  fallback: z.boolean(),
})
export type ServedBy = z.infer<typeof ServedBySchema>

/** Normalised assistant turn. Never carries the raw SDK response, upstream headers or keys. */
export const MessagesResponseSchema = z.object({
  content: z.array(ContentBlockSchema),
  stopReason: StopReasonSchema,
  usage: UsageSchema,
  servedBy: ServedBySchema,
})
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>
