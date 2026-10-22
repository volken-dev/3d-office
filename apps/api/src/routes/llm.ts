import { zValidator } from "@hono/zod-validator"
import { LLM_LIMITS, LlmCompletionRequestSchema } from "@the-delegation/shared/llm"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import type { AppEnv } from "../env"
import { ApiHttpError } from "../errors"
import { generateCompletion } from "../llm/gemini"
import { inMemoryRateLimit } from "../middleware/rate-limit"

// TODO(#15): require a session or signed anonymous token before public deploy (#2)
/**
 * Server-side completion proxy. Not yet safe to deploy publicly: until a session or signed anonymous token is
 * required, CORS, the rate limiter and the schema caps are the only guards.
 */
export const llm = new Hono<AppEnv>()
  .use(inMemoryRateLimit())
  .use(
    bodyLimit({
      maxSize: LLM_LIMITS.maxBodyBytes,
      onError: () => {
        throw new ApiHttpError(
          413,
          "payload_too_large",
          `Request body exceeds ${LLM_LIMITS.maxBodyBytes} bytes`,
        )
      },
    }),
  )
  .post(
    "/completions",
    zValidator("json", LlmCompletionRequestSchema, (result) => {
      if (result.success) return
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }))
      throw new ApiHttpError(400, "validation_failed", "Invalid completion request", {}, issues)
    }),
    async (context) => {
      const apiKey = context.env?.GEMINI_API_KEY
      if (!apiKey) throw new ApiHttpError(503, "not_configured", "LLM proxy is not configured")
      return context.json(await generateCompletion(apiKey, context.req.valid("json")), 200)
    },
  )
