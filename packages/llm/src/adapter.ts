import type {
  Effort,
  LlmProvider,
  MessagesRequest,
  MessagesResponse,
} from "@the-delegation/shared/llm-messages"
import type { ModelEntry } from "./registry"

/** Effort used when a request names none, so every provider runs at the same depth by default. */
export const DEFAULT_EFFORT: Effort = "high"

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
