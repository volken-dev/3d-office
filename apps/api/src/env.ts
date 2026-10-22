import type { RequestIdVariables } from "hono/request-id"

/**
 * Runtime bindings. On Workers these are secrets/vars; under Bun the entry point passes process env plus the
 * socket address. Everything is optional so a missing value fails at the route that needs it, not at boot.
 */
export type Bindings = {
  /** Server-held Claude key. Unset makes /llm answer 503 not_configured. */
  ANTHROPIC_API_KEY?: string
  /** Server-held OpenAI key for outage fallback. Unset means requests are served by Claude only. */
  OPENAI_API_KEY?: string
  /** Comma-separated list of origins allowed by CORS. Unset means no browser origin is allowed. */
  ALLOWED_ORIGINS?: string
  /** Requests per client IP per minute for throttled route groups; defaults to 20 when unset or invalid. */
  RATE_LIMIT_PER_MINUTE?: string
  /** Peer address supplied by the Bun entry; on Workers the cf-connecting-ip header is used instead. */
  CLIENT_IP?: string
}

/** Hono environment shared by the app and every route group: typed bindings plus the request id variable. */
export type AppEnv = {
  Bindings: Bindings
  Variables: RequestIdVariables
}
