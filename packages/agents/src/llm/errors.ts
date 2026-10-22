/**
 * - missing_key / auth: only the user can fix it (open the key dialog).
 * - quota: retrying makes it worse; pause until the user resumes.
 * - transient: network, timeout or 5xx; safe to retry with backoff.
 * - aborted: we cancelled the call ourselves (reset, team switch, task removed).
 */
export type LLMErrorKind = "missing_key" | "auth" | "quota" | "transient" | "aborted" | "other"

/** A failed LLM call, classified so callers can decide between retrying, pausing and asking for a key. */
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

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined
  return typeof error.status === "number" ? error.status : undefined
}

function classifyLLMError(error: unknown): LLMErrorKind {
  if (error instanceof LLMError) return error.kind
  const name = error instanceof Error ? error.name : ""
  const message = error instanceof Error ? error.message : String(error)

  if (name === "TimeoutError") return "transient"
  if (name === "AbortError") return "aborted"

  const status = statusOf(error)
  if (
    status === 401 ||
    status === 403 ||
    /API[_ ]KEY[_ ]INVALID|API key not valid|PERMISSION_DENIED/i.test(message)
  )
    return "auth"
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) return "quota"
  if (
    (status !== undefined && status >= 500) ||
    /failed to fetch|network|timed? ?out|UNAVAILABLE/i.test(message)
  )
    return "transient"
  return "other"
}

/** Normalises anything a provider throws into an `LLMError` whose kind drives the retry policy. */
export function toLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new LLMError(classifyLLMError(error), message, { cause: error })
}
