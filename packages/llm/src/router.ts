import type {
  LlmProvider,
  MessagesRequest,
  MessagesResponse,
} from "@the-delegation/shared/llm-messages"
import type { CompletionOptions, ProviderAdapter } from "./adapter"
import { shouldFailOver } from "./errors"
import { findBackupModel, findModel, type ModelEntry } from "./registry"

export interface CircuitBreakerOptions {
  /** Consecutive failover-worthy errors from one provider before its circuit opens. */
  failureThreshold: number
  /** How long an open circuit sends traffic straight to the backup before trying the provider again. */
  cooldownMs: number
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 3,
  cooldownMs: 30_000,
}

export interface RouterOptions {
  adapters: Readonly<Record<LlmProvider, ProviderAdapter>>
  breaker?: CircuitBreakerOptions
  now?: () => number
}

export interface LlmRouter {
  /**
   * Serves a request on its model, failing over once to the model's backup when the provider is rate limited,
   * overloaded or unavailable, or when its circuit is open. Never sends a request more than twice; auth,
   * invalid-request, aborted and refusal outcomes are returned or thrown as they are.
   */
  complete(request: MessagesRequest, options?: CompletionOptions): Promise<MessagesResponse>
}

/** The request names a model the registry does not serve; the gateway answers 400. */
export class UnknownModelError extends Error {
  constructor(public readonly modelId: string) {
    super(`Unknown model "${modelId}"`)
    this.name = "UnknownModelError"
  }
}

interface CircuitState {
  consecutiveFailures: number
  openedAt: number | null
}

/**
 * Per-provider circuit breaker, in memory. On Workers each isolate keeps its own copy, which is enough to avoid
 * repeatedly paying for a round trip to a provider that is down.
 */
class CircuitBreaker {
  private readonly circuits = new Map<LlmProvider, CircuitState>()

  constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly now: () => number,
  ) {}

  /** Open and still cooling down. After the cooldown one trial request goes through (half-open). */
  isOpen(provider: LlmProvider): boolean {
    const openedAt = this.circuits.get(provider)?.openedAt
    return openedAt != null && this.now() - openedAt < this.options.cooldownMs
  }

  recordSuccess(provider: LlmProvider): void {
    this.circuits.set(provider, { consecutiveFailures: 0, openedAt: null })
  }

  recordFailure(provider: LlmProvider): void {
    const failures = (this.circuits.get(provider)?.consecutiveFailures ?? 0) + 1
    this.circuits.set(provider, {
      consecutiveFailures: failures,
      openedAt: failures >= this.options.failureThreshold ? this.now() : null,
    })
  }
}

/** Builds the router the gateway serves every completion through. */
export function createLlmRouter({
  adapters,
  breaker = DEFAULT_CIRCUIT_BREAKER,
  now = Date.now,
}: RouterOptions): LlmRouter {
  const circuits = new CircuitBreaker(breaker, now)

  async function attempt(
    model: ModelEntry,
    request: MessagesRequest,
    options: CompletionOptions | undefined,
  ): Promise<MessagesResponse> {
    const provider = model.provider
    try {
      const response = await adapters[provider].complete(model, request, options)
      circuits.recordSuccess(provider)
      return response
    } catch (error) {
      if (shouldFailOver(error)) circuits.recordFailure(provider)
      throw error
    }
  }

  async function onBackup(
    backup: ModelEntry,
    request: MessagesRequest,
    options: CompletionOptions | undefined,
  ): Promise<MessagesResponse> {
    const response = await attempt(backup, request, options)
    return { ...response, servedBy: { ...response.servedBy, fallback: true } }
  }

  return {
    async complete(request, options) {
      const model = findModel(request.model)
      if (!model) throw new UnknownModelError(request.model)
      const backup = findBackupModel(model)

      if (backup && circuits.isOpen(model.provider)) return onBackup(backup, request, options)

      try {
        return await attempt(model, request, options)
      } catch (error) {
        if (!backup || !shouldFailOver(error) || options?.signal?.aborted) throw error
        return onBackup(backup, request, options)
      }
    },
  }
}
