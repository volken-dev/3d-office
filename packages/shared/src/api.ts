import { z } from "zod"

/** The closed set of machine-readable error codes, so clients can branch on code rather than message. */
export const API_ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "not_found",
  "payload_too_large",
  "rate_limited",
  "not_configured",
  "upstream_error",
  "internal_error",
] as const

/** Validates an error code against `API_ERROR_CODES`. */
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES)
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>

/** Every non-2xx response from the API has this body. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/**
 * Body of `GET /api/health`, the liveness probe. `llm` says which providers have server keys (never the keys), so the
 * web app can tell "unreachable" from "not configured" without spending a model call.
 */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  time: z.string(),
  llm: z.object({ configured: z.boolean(), fallback: z.boolean() }),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>
