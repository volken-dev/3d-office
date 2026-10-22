import { zValidator } from "@hono/zod-validator"
import { ProviderError, type ProviderErrorKind } from "@the-delegation/llm/errors"
import { UnknownModelError } from "@the-delegation/llm/router"
import type { ApiErrorCode } from "@the-delegation/shared/api"
import { LLM_MESSAGES_LIMITS, MessagesRequestSchema } from "@the-delegation/shared/llm-messages"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { AppEnv } from "../env"
import { ApiHttpError } from "../errors"
import type { RouterForEnv } from "../llm/routerForEnv"
import { inMemoryRateLimit } from "../middleware/rate-limit"

/** How each provider failure reaches the client. Messages are ours; upstream text stays in server logs. */
const PROVIDER_FAILURES: Record<
  ProviderErrorKind,
  { status: ContentfulStatusCode; code: ApiErrorCode; message: string }
> = {
  rate_limited: {
    status: 429,
    code: "rate_limited",
    message: "The model provider is rate limiting requests. Try again shortly.",
  },
  overloaded: {
    status: 503,
    code: "upstream_error",
    message: "The model provider is overloaded. Try again shortly.",
  },
  unavailable: {
    status: 503,
    code: "upstream_error",
    message: "The model provider is unavailable. Try again shortly.",
  },
  auth: {
    status: 503,
    code: "not_configured",
    message: "The server's model provider credentials were rejected.",
  },
  invalid_request: {
    status: 400,
    code: "bad_request",
    message: "The model provider rejected the request.",
  },
  aborted: { status: 503, code: "upstream_error", message: "The request was cancelled." },
  other: { status: 502, code: "upstream_error", message: "The model provider returned an error." },
}

function toApiError(error: unknown, requestId: string | undefined): ApiHttpError {
  if (error instanceof UnknownModelError) {
    return new ApiHttpError(400, "bad_request", `Model "${error.modelId}" is not available`)
  }
  if (error instanceof ProviderError) {
    console.error(
      `[${requestId}] ${error.provider} ${error.kind}${error.status ? ` ${error.status}` : ""}: ${error.detail}`,
    )
    const failure = PROVIDER_FAILURES[error.kind]
    return new ApiHttpError(failure.status, failure.code, failure.message)
  }
  throw error
}

// TODO(#27): require a signed-in session and enforce the per-user spend cap before public deploy (#2)
/**
 * The LLM gateway. Validates the provider-neutral request, serves it through the router (Claude first, OpenAI
 * on outages) and returns the normalised reply. Not safe to deploy publicly until sign-in lands: CORS, the
 * rate limiter and the schema caps are the only guards.
 */
export function createLlmRoutes(routerForEnv: RouterForEnv) {
  return new Hono<AppEnv>()
    .use(inMemoryRateLimit())
    .use(
      bodyLimit({
        maxSize: LLM_MESSAGES_LIMITS.maxBodyBytes,
        onError: () => {
          throw new ApiHttpError(
            413,
            "payload_too_large",
            `Request body exceeds ${LLM_MESSAGES_LIMITS.maxBodyBytes} bytes`,
          )
        },
      }),
    )
    .post(
      "/messages",
      zValidator("json", MessagesRequestSchema, (result) => {
        if (result.success) return
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        }))
        throw new ApiHttpError(400, "validation_failed", "Invalid messages request", {}, issues)
      }),
      async (context) => {
        const router = routerForEnv(context.env)
        if (!router) throw new ApiHttpError(503, "not_configured", "LLM gateway is not configured")
        try {
          const response = await router.complete(context.req.valid("json"), {
            signal: context.req.raw.signal,
          })
          return context.json(response, 200)
        } catch (error) {
          throw toApiError(error, context.get("requestId"))
        }
      },
    )
}
