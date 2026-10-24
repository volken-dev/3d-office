import type { RequestIdVariables } from "hono/request-id"

/** Hono environment shared by the app and every route group: the request id variable. */
export type AppEnv = {
  Variables: RequestIdVariables
}
