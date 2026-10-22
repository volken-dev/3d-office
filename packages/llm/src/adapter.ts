import type {
  LlmProvider,
  MessagesRequest,
  MessagesResponse,
} from "@the-delegation/shared/llm-messages"
import type { ModelEntry } from "./registry"

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
