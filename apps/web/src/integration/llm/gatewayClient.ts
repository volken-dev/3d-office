import { LLMError, type LLMErrorKind } from "@the-delegation/agents/llm/errors"
import type { LLMCallOptions, LLMClient } from "@the-delegation/agents/llm/types"
import { type ApiErrorCode, ApiErrorSchema } from "@the-delegation/shared/api"
import {
  type MessagesRequest,
  type MessagesResponse,
  MessagesResponseSchema,
} from "@the-delegation/shared/llm-messages"
import { createApiClient } from "../../lib/api-client"

const ERROR_KINDS: Record<ApiErrorCode, LLMErrorKind> = {
  rate_limited: "rate_limited",
  not_configured: "not_configured",
  upstream_error: "unavailable",
  internal_error: "unavailable",
  bad_request: "invalid_request",
  validation_failed: "invalid_request",
  payload_too_large: "invalid_request",
  not_found: "not_configured",
}

function signalFor(options: LLMCallOptions | undefined): AbortSignal | undefined {
  const signals = [
    options?.signal,
    options?.timeoutMs !== undefined ? AbortSignal.timeout(options.timeoutMs) : undefined,
  ].filter((signal): signal is AbortSignal => signal !== undefined)
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0]
}

async function errorFromResponse(response: {
  status: number
  json(): Promise<unknown>
}): Promise<LLMError> {
  const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    return new LLMError("unavailable", `The model gateway answered ${response.status}.`)
  }
  return new LLMError(ERROR_KINDS[parsed.data.error.code], parsed.data.error.message)
}

/**
 * The browser's model client: every call goes to the Hono gateway (`POST /api/llm/messages`), which holds the
 * provider keys. The response is validated before the agent loop sees it.
 */
export function createGatewayClient(baseUrl?: string): LLMClient {
  return {
    async complete(request: MessagesRequest, options?: LLMCallOptions): Promise<MessagesResponse> {
      let api: ReturnType<typeof createApiClient>
      try {
        api = createApiClient(baseUrl)
      } catch {
        throw new LLMError("not_configured", "The model gateway address is not set.")
      }
      const response = await api.api.llm.messages.$post(
        { json: request },
        { init: { signal: signalFor(options) } },
      )
      if (!response.ok) throw await errorFromResponse(response)
      const parsed = MessagesResponseSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new LLMError("unavailable", "The model gateway sent a reply this app cannot read.")
      }
      return parsed.data
    },
  }
}
