import type { AppType } from "api"
import { hc } from "hono/client"

/**
 * Typed client for the Hono API in apps/api, used by the gateway LLM client. Only types come from the api
 * workspace, so no server code reaches the web bundle.
 *
 * NEXT_PUBLIC_API_URL is the API origin (e.g. http://localhost:8787); routes already carry the /api prefix.
 * It is inlined at build time, so it must never hold a secret.
 */
export function createApiClient(baseUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL) {
  if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL is not set")
  return hc<AppType>(baseUrl)
}
