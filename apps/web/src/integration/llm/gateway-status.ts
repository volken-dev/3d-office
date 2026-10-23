import { HealthResponseSchema } from "@the-delegation/shared/api"
import { createApiClient } from "../../lib/api-client"

/**
 * - checking: the first probe has not answered yet.
 * - online: the gateway answers and has a Claude key.
 * - not_configured: the gateway answers but has no Claude key, so every model call would fail.
 * - unreachable: no address is set, or the gateway did not answer with a valid health response.
 */
export type GatewayStatus = "checking" | "online" | "not_configured" | "unreachable"

const PROBE_TIMEOUT_MS = 5_000

/** Probes `GET /api/health`. Never throws: every failure is a status the UI can explain. */
export async function probeGateway(baseUrl?: string): Promise<GatewayStatus> {
  try {
    const response = await createApiClient(baseUrl).api.health.$get(undefined, {
      init: { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    })
    if (!response.ok) return "unreachable"
    const parsed = HealthResponseSchema.safeParse(await response.json())
    if (!parsed.success) return "unreachable"
    return parsed.data.llm.configured ? "online" : "not_configured"
  } catch {
    return "unreachable"
  }
}
