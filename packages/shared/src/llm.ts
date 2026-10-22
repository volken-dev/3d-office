import { z } from "zod"

/** Models the proxy accepts; anything else is rejected so a client cannot pick an arbitrarily priced model. */
export const LLM_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
] as const

/** Model used when a completion request omits `model`. */
export const DEFAULT_LLM_MODEL: LlmModel = "gemini-3-flash-preview"

/**
 * Hard caps the server enforces on every completion request. They bound what one call can cost and keep a
 * misbehaving client from turning the endpoint into an open relay for arbitrary prompts.
 */
export const LLM_LIMITS = {
  maxBodyBytes: 256 * 1024,
  maxMessages: 200,
  maxMessageChars: 32_000,
  maxSystemInstructionChars: 32_000,
  maxTools: 32,
  maxToolCallsPerMessage: 32,
  maxOutputTokens: 16_384,
} as const

/** Validates a model id against `LLM_MODELS`. */
export const LlmModelSchema = z.enum(LLM_MODELS)
export type LlmModel = z.infer<typeof LlmModelSchema>

/** Gemini needs function arguments and tool results as objects, so strings carrying them must parse to one. */
function isJsonObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

const ToolNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/, "Invalid tool name")

/** The subset of JSON Schema that Gemini function declarations accept. Unknown keywords are stripped. */
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

/** Recursive, size-capped validator for tool parameter schemas, so a client cannot send unbounded schemas. */
export const JsonSchemaSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    type: z.enum(["string", "number", "integer", "boolean", "array", "object", "null"]).optional(),
    description: z.string().max(2000).optional(),
    enum: z
      .array(z.union([z.string().max(256), z.number()]))
      .max(100)
      .optional(),
    nullable: z.boolean().optional(),
    properties: z.record(z.string().max(64), JsonSchemaSchema).optional(),
    required: z.array(z.string().max(64)).max(64).optional(),
    items: JsonSchemaSchema.optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
  }),
)

/** A function call the model made, in the OpenAI-style shape the web app's agents already use. */
export const LlmToolCallSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("function"),
  function: z.object({
    name: ToolNameSchema,
    arguments: z
      .string()
      .max(LLM_LIMITS.maxMessageChars)
      .refine(isJsonObject, "arguments must be a JSON object string"),
  }),
  /** Opaque Gemini thought signature; must be sent back unchanged on the next turn for Gemini 3 tool calling. */
  thought_signature: z.string().max(16_384).optional(),
})
export type LlmToolCall = z.infer<typeof LlmToolCallSchema>

/** A function the model may call; mapped to a Gemini function declaration by the server. */
export const LlmToolDefinitionSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: ToolNameSchema,
    description: z.string().max(2000),
    parameters: JsonSchemaSchema.optional(),
  }),
})
export type LlmToolDefinition = z.infer<typeof LlmToolDefinitionSchema>

/** System prompts go in `systemInstruction`, not in `messages`. A `tool` message carries a JSON object result. */
export const LlmMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "tool"]),
    content: z.string().max(LLM_LIMITS.maxMessageChars),
    name: ToolNameSchema.optional(),
    tool_calls: z.array(LlmToolCallSchema).max(LLM_LIMITS.maxToolCallsPerMessage).optional(),
  })
  .superRefine((message, context) => {
    if (message.role !== "tool") return
    if (!message.name) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "tool messages require the tool name",
      })
    }
    if (!isJsonObject(message.content)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "tool message content must be a JSON object string",
      })
    }
  })
export type LlmMessage = z.infer<typeof LlmMessageSchema>

/** Body of `POST /api/llm/completions`; every array and string is capped by `LLM_LIMITS`. */
export const LlmCompletionRequestSchema = z.object({
  model: LlmModelSchema.default(DEFAULT_LLM_MODEL),
  systemInstruction: z.string().max(LLM_LIMITS.maxSystemInstructionChars).optional(),
  messages: z.array(LlmMessageSchema).min(1).max(LLM_LIMITS.maxMessages),
  tools: z.array(LlmToolDefinitionSchema).max(LLM_LIMITS.maxTools).optional(),
  maxOutputTokens: z.number().int().positive().max(LLM_LIMITS.maxOutputTokens).optional(),
})
/** What a client sends (model may be omitted). */
export type LlmCompletionRequestInput = z.input<typeof LlmCompletionRequestSchema>
/** What the server works with after validation and defaults. */
export type LlmCompletionRequest = z.output<typeof LlmCompletionRequestSchema>

/** Token counts for one call; completion tokens include thinking tokens because they are billed as output. */
export const LlmTokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
})
export type LlmTokenUsage = z.infer<typeof LlmTokenUsageSchema>

/** Normalized provider output. Never carries the raw SDK response or upstream headers. */
export const LlmCompletionResponseSchema = z.object({
  content: z.string().nullable(),
  tool_calls: z.array(LlmToolCallSchema),
  usage: LlmTokenUsageSchema.nullable(),
  finishReason: z.string().nullable(),
  modelVersion: z.string().nullable(),
})
export type LlmCompletionResponse = z.infer<typeof LlmCompletionResponseSchema>
