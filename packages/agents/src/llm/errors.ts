/**
 * Why a model call failed, from the agent loop's point of view:
 * - not_configured: the gateway has no working provider credentials; only an operator can fix it.
 * - rate_limited: the provider or the gateway is throttling; pause until the user resumes.
 * - unavailable: network, timeout or provider outage; safe to retry with backoff.
 * - invalid_request: the request was rejected as malformed; retrying will not help.
 * - aborted: we cancelled the call ourselves (reset, team switch, task removed).
 */
export type LLMErrorKind =
  | "not_configured"
  | "rate_limited"
  | "unavailable"
  | "invalid_request"
  | "aborted"
  | "other"

/** A failed LLM call, classified so callers can decide between retrying, pausing and asking the user. */
export class LLMError extends Error {
  constructor(
    public readonly kind: LLMErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = "LLMError"
  }
}

function classifyUnknownError(error: unknown): LLMErrorKind {
  const name = error instanceof Error ? error.name : ""
  if (name === "AbortError") return "aborted"
  if (name === "TimeoutError") return "unavailable"
  if (error instanceof TypeError) return "unavailable"
  return "other"
}

/** Normalises anything a client throws into an `LLMError` whose kind drives the retry policy. */
export function toLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new LLMError(classifyUnknownError(error), message, { cause: error })
}
