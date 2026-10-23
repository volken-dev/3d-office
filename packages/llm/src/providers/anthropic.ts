import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaStopReason,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import type {
  ContentBlock,
  Message,
  MessagesRequest,
  MessagesResponse,
  StopReason,
  ToolDefinition,
} from "@the-delegation/shared/llm-messages"
import {
  assertObjectToolSchema,
  type CompletionOptions,
  DEFAULT_EFFORT,
  maxOutputTokensFor,
  type ProviderAdapter,
} from "../adapter"
import { type ProviderErrorKind, toProviderError } from "../errors"
import type { ModelEntry } from "../registry"

/** Sends one Messages request and resolves with the complete message. */
export type AnthropicSend = (
  params: BetaMessageStreamParams,
  signal: AbortSignal | undefined,
) => Promise<BetaMessage>

/**
 * Server-side refusal fallback (`fallbacks: "default"`) and block-binding controls. With `drop_block`, a thinking
 * block whose conversation prefix no longer matches is dropped instead of failing the request with a 400.
 */
const BETAS = ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"]

/** Assistant blocks other than text and tool use that must be replayed byte for byte on later turns. */
const REPLAYABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "thinking",
  "redacted_thinking",
  "fallback",
  "compaction",
])

const STOP_REASONS: Record<BetaStopReason, StopReason> = {
  end_turn: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
  pause_turn: "pause",
  stop_sequence: "other",
  compaction: "other",
  model_context_window_exceeded: "max_tokens",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A reasoning payload is replayable only if it is one of the block shapes this adapter stored. */
function isReplayableBlock(payload: unknown): payload is BetaContentBlockParam {
  return (
    isRecord(payload) &&
    typeof payload.type === "string" &&
    REPLAYABLE_BLOCK_TYPES.has(payload.type)
  )
}

function toBlockParams(blocks: readonly ContentBlock[]): BetaContentBlockParam[] {
  return blocks.flatMap((block): BetaContentBlockParam[] => {
    if (block.type === "text") return [{ type: "text", text: block.text }]
    if (block.type === "tool_call") {
      return [{ type: "tool_use", id: block.id, name: block.name, input: block.input }]
    }
    if (block.type === "tool_result") {
      return [
        {
          type: "tool_result",
          tool_use_id: block.toolCallId,
          content: block.content,
          is_error: block.isError,
        },
      ]
    }
    return block.provider === "anthropic" && isReplayableBlock(block.payload) ? [block.payload] : []
  })
}

/** Another provider's reasoning is dropped, and a message left empty by that is dropped with it. */
function toMessageParams(messages: readonly Message[]): BetaMessageParam[] {
  return messages.flatMap((message) => {
    const content = toBlockParams(message.content)
    return content.length > 0 ? [{ role: message.role, content }] : []
  })
}

function toTool(tool: ToolDefinition): BetaTool {
  assertObjectToolSchema(tool, "anthropic")
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: "object" },
    ...(tool.inputSchema.additionalProperties === false ? { strict: true } : {}),
  }
}

function fromContent(blocks: readonly BetaContentBlock[]): ContentBlock[] {
  return blocks.flatMap((block): ContentBlock[] => {
    if (block.type === "text") return [{ type: "text", text: block.text }]
    if (block.type === "tool_use") {
      return [
        {
          type: "tool_call",
          id: block.id,
          name: block.name,
          input: isRecord(block.input) ? block.input : {},
        },
      ]
    }
    return REPLAYABLE_BLOCK_TYPES.has(block.type)
      ? [{ type: "reasoning", provider: "anthropic", payload: block }]
      : []
  })
}

function fromMessage(message: BetaMessage): MessagesResponse {
  return {
    content: fromContent(message.content),
    stopReason: message.stop_reason ? STOP_REASONS[message.stop_reason] : "other",
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    servedBy: { provider: "anthropic", model: message.model, fallback: false },
  }
}

function statusOf(error: unknown): number | undefined {
  return error instanceof Anthropic.APIError ? error.status : undefined
}

function classify(error: unknown): ProviderErrorKind {
  if (error instanceof Anthropic.APIUserAbortError) return "aborted"
  if (error instanceof Anthropic.APIConnectionError) return "unavailable"
  if (error instanceof Anthropic.AuthenticationError) return "auth"
  if (error instanceof Anthropic.PermissionDeniedError) return "auth"
  if (error instanceof Anthropic.RateLimitError) return "rate_limited"
  if (error instanceof Anthropic.BadRequestError) return "invalid_request"
  if (error instanceof Anthropic.NotFoundError) return "invalid_request"
  if (error instanceof Anthropic.UnprocessableEntityError) return "invalid_request"
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529) return "overloaded"
    if (error.status !== undefined && error.status >= 500) return "unavailable"
  }
  if (error instanceof Error && error.name === "AbortError") return "aborted"
  return "other"
}

/** Builds the Messages API request: adaptive thinking, explicit effort, strict tools, automatic prompt caching. */
export function toAnthropicParams(
  model: ModelEntry,
  request: MessagesRequest,
): BetaMessageStreamParams {
  return {
    model: model.id,
    max_tokens: maxOutputTokensFor(model, request),
    system: request.system,
    messages: toMessageParams(request.messages),
    ...(request.tools?.length ? { tools: request.tools.map(toTool) } : {}),
    thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
    output_config: { effort: request.effort ?? DEFAULT_EFFORT },
    cache_control: { type: "ephemeral" },
    fallbacks: "default",
    betas: BETAS,
  }
}

/** Streams so long turns never hit an HTTP timeout; only the final message is used. */
export function anthropicSendFor(client: Anthropic): AnthropicSend {
  return (params, signal) => client.beta.messages.stream(params, { signal }).finalMessage()
}

/** Production transport for a server-held key. */
export function anthropicSendForKey(apiKey: string): AnthropicSend {
  return anthropicSendFor(new Anthropic({ apiKey }))
}

/** The Claude adapter. `send` is injectable so tests can run without the network. */
export function createAnthropicAdapter(send: AnthropicSend): ProviderAdapter {
  return {
    provider: "anthropic",
    async complete(model: ModelEntry, request: MessagesRequest, options?: CompletionOptions) {
      try {
        const params = toAnthropicParams(model, request)
        return fromMessage(await send(params, options?.signal))
      } catch (error) {
        throw toProviderError("anthropic", error, classify, statusOf(error))
      }
    },
  }
}
