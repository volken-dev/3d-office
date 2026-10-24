import { Hono } from "hono"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import type { AppEnv } from "./env"
import { errorBody, handleError } from "./errors"
import { health } from "./routes/health"

/** The API, runtime-agnostic: no Bun, Node or Workers globals here, so any entry point can mount it. */
export function createApp() {
  const app = new Hono<AppEnv>()
    .basePath("/api")
    .use(requestId())
    .use(secureHeaders())
    .route("/health", health)

  app.onError(handleError)
  app.notFound((context) => context.json(errorBody(context, "not_found", "Not found"), 404))
  return app
}

const app = createApp()

/** The route tree's type, for a typed `hc<AppType>` client. */
export type AppType = typeof app
export default app
