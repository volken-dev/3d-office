import type {
  ContentBlock,
  Effort,
  JsonSchema,
  Message,
  MessagesRequest,
  MessagesResponse,
  StopReason,
  ToolDefinition,
} from "@the-delegation/shared/llm-messages"
import OpenAI from "openai"
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseReasoningItem,
} from "openai/resources/responses/responses"
import {
  assertObjectToolSchema,
  type CompletionOptions,
  DEFAULT_EFFORT,
  maxOutputTokensFor,
  type ProviderAdapter,
} from "../adapter"
import { ProviderError, type ProviderErrorKind, toProviderError } from "../errors"
import type { ModelEntry } from "../registry"

/** Sends one Responses API request and resolves with the complete response. */
export type OpenAISend = (
  params: ResponseCreateParamsNonStreaming,
  signal: AbortSignal | undefined,
) => Promise<Response>

/** A tool result that failed is marked in its text, since function_call_output has no error flag. */
const ERROR_RESULT_PREFIX = "Error: "

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A reasoning payload is replayable only if it is a reasoning item this adapter stored. */
function isReasoningItem(payload: unknown): payload is ResponseReasoningItem {
  return (
    isRecord(payload) &&
    payload.type === "reasoning" &&
    typeof payload.id === "string" &&
    Array.isArray(payload.summary)
  )
}

/** The requested effort, or the default; falls back to the default when the model does not offer it. */
function effortFor(model: ModelEntry, request: MessagesRequest): Effort {
  const effort = request.effort ?? DEFAULT_EFFORT
  return model.effortLevels.includes(effort) ? effort : DEFAULT_EFFORT
}

/** OpenAI strict mode needs `additionalProperties: false` and every property listed in `required`. */
function isStrictEligible(schema: JsonSchema): boolean {
  if (schema.additionalProperties !== false) return false
  const required = new Set(schema.required ?? [])
  return Object.keys(schema.properties ?? {}).every((property) => required.has(property))
}

function toTool(tool: ToolDefinition): FunctionTool {
  assertObjectToolSchema(tool, "openai")
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: { ...tool.inputSchema },
    strict: isStrictEligible(tool.inputSchema),
  }
}

function toInputItems(message: Message): ResponseInputItem[] {
  return message.content.flatMap((block): ResponseInputItem[] => {
    if (block.type === "text") {
      return [{ type: "message", role: message.role, content: block.text }]
    }
    if (block.type === "tool_call") {
      return [
        {
          type: "function_call",
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      ]
    }
    if (block.type === "tool_result") {
      return [
        {
          type: "function_call_output",
          call_id: block.toolCallId,
          output: block.isError ? `${ERROR_RESULT_PREFIX}${block.content}` : block.content,
        },
      ]
    }
    return block.provider === "openai" && isReasoningItem(block.payload) ? [block.payload] : []
  })
}

function parseArguments(argumentsText: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsText)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function fromOutput(response: Response): { content: ContentBlock[]; refused: boolean } {
  let refused = false
  const content = response.output.flatMap((item): ContentBlock[] => {
    if (item.type === "reasoning") return [{ type: "reasoning", provider: "openai", payload: item }]
    if (item.type === "function_call") {
      return [
        {
          type: "tool_call",
          id: item.call_id,
          name: item.name,
          input: parseArguments(item.arguments),
        },
      ]
    }
    if (item.type === "message") {
      return item.content.map((part): ContentBlock => {
        if (part.type === "refusal") {
          refused = true
          return { type: "text", text: part.refusal }
        }
        return { type: "text", text: part.text }
      })
    }
    return []
  })
  return { content, refused }
}

function stopReasonOf(response: Response, content: ContentBlock[], refused: boolean): StopReason {
  const incompleteReason = response.incomplete_details?.reason
  if (refused || incompleteReason === "content_filter") return "refusal"
  if (incompleteReason === "max_output_tokens") return "max_tokens"
  if (content.some((block) => block.type === "tool_call")) return "tool_use"
  return response.status === "incomplete" ? "other" : "end_turn"
}

function fromResponse(response: Response): MessagesResponse {
  if (response.error || response.status === "failed") {
    throw new ProviderError(
      "unavailable",
      "openai",
      response.error?.message ?? `Response ${response.id} failed`,
    )
  }
  const { content, refused } = fromOutput(response)
  const cachedTokens = response.usage?.input_tokens_details.cached_tokens ?? 0
  return {
    content,
    stopReason: stopReasonOf(response, content, refused),
    usage: {
      inputTokens: Math.max(0, (response.usage?.input_tokens ?? 0) - cachedTokens),
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: cachedTokens,
      cacheWriteTokens: 0,
    },
    servedBy: { provider: "openai", model: response.model, fallback: false },
  }
}

function statusOf(error: unknown): number | undefined {
  return error instanceof OpenAI.APIError ? error.status : undefined
}

function classify(error: unknown): ProviderErrorKind {
  if (error instanceof OpenAI.APIUserAbortError) return "aborted"
  if (error instanceof OpenAI.APIConnectionError) return "unavailable"
  if (error instanceof OpenAI.AuthenticationError) return "auth"
  if (error instanceof OpenAI.PermissionDeniedError) return "auth"
  if (error instanceof OpenAI.RateLimitError) return "rate_limited"
  if (error instanceof OpenAI.BadRequestError) return "invalid_request"
  if (error instanceof OpenAI.NotFoundError) return "invalid_request"
  if (error instanceof OpenAI.UnprocessableEntityError) return "invalid_request"
  if (error instanceof OpenAI.APIError && error.status !== undefined && error.status >= 500) {
    return "unavailable"
  }
  if (error instanceof Error && error.name === "AbortError") return "aborted"
  return "other"
}

/**
 * Builds a stateless Responses API request: nothing is stored on OpenAI's side, so the whole history is sent
 * and reasoning items (with their encrypted content) are replayed from it.
 */
export function toOpenAIParams(
  model: ModelEntry,
  request: MessagesRequest,
): ResponseCreateParamsNonStreaming {
  return {
    model: model.id,
    instructions: request.system,
    input: request.messages.flatMap(toInputItems),
    ...(request.tools?.length ? { tools: request.tools.map(toTool) } : {}),
    reasoning: { effort: effortFor(model, request) },
    max_output_tokens: maxOutputTokensFor(model, request),
    store: false,
    include: ["reasoning.encrypted_content"],
  }
}

/** Production transport over the official SDK. */
export function openAISendFor(client: OpenAI): OpenAISend {
  return (params, signal) => client.responses.create(params, { signal })
}

/** Production transport for a server-held key. */
export function openAISendForKey(apiKey: string): OpenAISend {
  return openAISendFor(new OpenAI({ apiKey }))
}

/** The OpenAI adapter, used as the outage backup. `send` is injectable so tests run without the network. */
export function createOpenAIAdapter(send: OpenAISend): ProviderAdapter {
  return {
    provider: "openai",
    async complete(model: ModelEntry, request: MessagesRequest, options?: CompletionOptions) {
      try {
        const params = toOpenAIParams(model, request)
        return fromResponse(await send(params, options?.signal))
      } catch (error) {
        throw toProviderError("openai", error, classify, statusOf(error))
      }
    },
  }
}
