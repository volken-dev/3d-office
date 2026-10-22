import { Hono } from "hono"
import { cors } from "hono/cors"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import type { AppEnv } from "./env"
import { errorBody, handleError } from "./errors"
import { health } from "./routes/health"
import { llm } from "./routes/llm"

/** Splits the comma-separated ALLOWED_ORIGINS binding; unset or empty means no browser origin is allowed. */
function allowedOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

/**
 * The API, runtime-agnostic: no Bun, Node or Workers globals here, so any entry point can mount it. Middleware
 * order is request id, secure headers, then CORS app-wide; route groups add rate limit, body limit and validation.
 */
const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(requestId())
  .use(secureHeaders())
  .use(
    cors({
      origin: (origin, context) =>
        allowedOrigins(context.env?.ALLOWED_ORIGINS).includes(origin) ? origin : null,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      exposeHeaders: ["X-Request-Id", "Retry-After"],
      maxAge: 600,
    }),
  )
  .route("/health", health)
  .route("/llm", llm)

app.onError(handleError)
app.notFound((context) => context.json(errorBody(context, "not_found", "Not found"), 404))

/** The route tree's type, consumed by the typed `hc<AppType>` client in apps/web. */
export type AppType = typeof app
export default app
