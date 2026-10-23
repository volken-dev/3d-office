import type {
  Effort,
  LlmProvider,
  MessagesRequest,
  MessagesResponse,
  ToolDefinition,
} from "@the-delegation/shared/llm-messages"
import { ProviderError } from "./errors"
import type { ModelEntry } from "./registry"

/** Effort used when a request names none, so every provider runs at the same depth by default. */
export const DEFAULT_EFFORT: Effort = "high"

/** Output budget when a request names none; thinking and output share it, so it leaves room for long agentic turns. */
const DEFAULT_MAX_OUTPUT_TOKENS = 64_000

/** The output-token cap to send: the request's (or the default), never above what the model allows. */
export function maxOutputTokensFor(model: ModelEntry, request: MessagesRequest): number {
  return Math.min(request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, model.maxOutputTokens)
}

/** Both providers take only object-typed tool inputs; anything else is a bad request, not an outage. */
export function assertObjectToolSchema(tool: ToolDefinition, provider: LlmProvider): void {
  if (tool.inputSchema.type !== "object") {
    throw new ProviderError(
      "invalid_request",
      provider,
      `Tool "${tool.name}" input schema must be an object`,
    )
  }
}

export interface CompletionOptions {
  signal?: AbortSignal
}

/**
 * One provider behind the gateway. `complete` maps the provider-neutral request onto the provider's API and
 * the reply back, and throws `ProviderError` for every failure.
 */
export interface ProviderAdapter {
  readonly provider: LlmProvider
  complete(
    model: ModelEntry,
    request: MessagesRequest,
    options?: CompletionOptions,
  ): Promise<MessagesResponse>
}
