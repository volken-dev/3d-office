import type { LlmProvider } from "@the-delegation/shared/llm-messages"

/**
 * Why a provider call failed, normalised across SDKs:
 * - auth: the server's key is missing, invalid or not allowed this model; only an operator can fix it.
 * - rate_limited / overloaded / unavailable: the provider cannot serve now; the router may fail over.
 * - invalid_request: the request itself is wrong; retrying or failing over will not help.
 * - aborted: we cancelled the call.
 */
export type ProviderErrorKind =
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "unavailable"
  | "invalid_request"
  | "aborted"
  | "other"

const FAILOVER_KINDS: ReadonlySet<ProviderErrorKind> = new Set([
  "rate_limited",
  "overloaded",
  "unavailable",
])

/** A failed provider call. `detail` keeps the upstream message for server logs; never send it to a client. */
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    public readonly provider: LlmProvider,
    public readonly detail: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(`${provider} request failed: ${kind}`, { cause: options?.cause })
    this.name = "ProviderError"
    this.status = options?.status
  }

  public readonly status: number | undefined
}

/**
 * Wraps whatever a provider SDK threw as a `ProviderError`, using that provider's classifier and
 * the HTTP status when the SDK reports one. A `ProviderError` passes through unchanged.
 */
export function toProviderError(
  provider: LlmProvider,
  error: unknown,
  classify: (error: unknown) => ProviderErrorKind,
  status: number | undefined,
): ProviderError {
  if (error instanceof ProviderError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new ProviderError(classify(error), provider, detail, { cause: error, status })
}

/** Whether the router may retry this failure once on the backup provider. */
export function shouldFailOver(error: unknown): boolean {
  return error instanceof ProviderError && FAILOVER_KINDS.has(error.kind)
}
