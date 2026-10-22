import type { ApiError, ApiErrorCode } from "@the-delegation/shared/api"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { AppEnv } from "./env"

/** Thrown by handlers to produce a typed JSON error; turned into a response by `handleError`. */
export class ApiHttpError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
    readonly issues?: ApiError["error"]["issues"],
  ) {
    super(status, { message })
  }
}

/** Maps a bare Hono HTTPException status onto the shared error code vocabulary. */
function codeForStatus(status: number): ApiErrorCode {
  if (status === 404) return "not_found"
  if (status === 413) return "payload_too_large"
  if (status === 429) return "rate_limited"
  if (status >= 400 && status < 500) return "bad_request"
  return "internal_error"
}

/** Builds the single error envelope every non-2xx response uses, stamped with the request id. */
export function errorBody(
  context: Context<AppEnv>,
  code: ApiErrorCode,
  message: string,
  issues?: ApiError["error"]["issues"],
): ApiError {
  return { error: { code, message, requestId: context.get("requestId"), issues } }
}

/**
 * App-wide error handler. Typed errors keep their code and headers; anything unexpected is logged server-side and
 * returned as a generic 500 so stack traces and upstream messages never reach the client.
 */
export function handleError(error: Error, context: Context<AppEnv>) {
  if (error instanceof ApiHttpError) {
    for (const [name, value] of Object.entries(error.headers)) context.header(name, value)
    return context.json(errorBody(context, error.code, error.message, error.issues), error.status)
  }
  if (error instanceof HTTPException) {
    return context.json(
      errorBody(context, codeForStatus(error.status), error.message),
      error.status,
    )
  }
  console.error(`[${context.get("requestId")}] unhandled ${error.name}: ${error.message}`)
  return context.json(errorBody(context, "internal_error", "Internal server error"), 500)
}
