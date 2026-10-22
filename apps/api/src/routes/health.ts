import type { HealthResponse } from "@the-delegation/shared/api"
import { Hono } from "hono"
import type { AppEnv } from "../env"

/** Liveness probe: unauthenticated and unthrottled, so it must never touch the model provider. */
export const health = new Hono<AppEnv>().get("/", (context) =>
  context.json<HealthResponse>({ status: "ok", time: new Date().toISOString() }),
)
