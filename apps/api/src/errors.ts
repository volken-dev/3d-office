import type { ApiError, ApiErrorCode } from "@the-delegation/shared/api"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { AppEnv } from "./env"

/** Builds the single error envelope every non-2xx response uses, stamped with the request id. */
export function errorBody(context: Context<AppEnv>, code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message, requestId: context.get("requestId") } }
}

/**
 * App-wide error handler. Hono's own HTTP errors keep their status; anything unexpected is logged
 * server-side and returned as a generic 500 so stack traces never reach the client.
 */
export function handleError(error: Error, context: Context<AppEnv>) {
  if (error instanceof HTTPException) {
    const code: ApiErrorCode = error.status === 404 ? "not_found" : "internal_error"
    return context.json(errorBody(context, code, error.message), error.status)
  }
  console.error(`[${context.get("requestId")}] unhandled ${error.name}: ${error.message}`)
  return context.json(errorBody(context, "internal_error", "Internal server error"), 500)
}
