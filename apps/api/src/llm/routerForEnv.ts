import { ProviderError } from "@the-delegation/llm/errors"
import {
  anthropicSendForKey,
  createAnthropicAdapter,
} from "@the-delegation/llm/providers/anthropic"
import { createOpenAIAdapter, openAISendForKey } from "@the-delegation/llm/providers/openai"
import { createLlmRouter, type LlmRouter } from "@the-delegation/llm/router"
import type { Bindings } from "../env"

/** Builds the router for the keys in this environment, or undefined when no Claude key is configured. */
export type RouterForEnv = (env: Bindings | undefined) => LlmRouter | undefined

let cached: { anthropicKey: string; openAIKey: string | undefined; router: LlmRouter } | undefined

/** Without an OpenAI key the backup is unavailable, so an outage surfaces instead of failing over. */
function openAIUnavailable(): Promise<never> {
  return Promise.reject(new ProviderError("unavailable", "openai", "OPENAI_API_KEY is not set"))
}

/**
 * One router per isolate and key pair, so its circuit breaker sees every request this isolate serves. A key
 * change (secret rotation) builds a fresh router.
 */
export const routerForEnv: RouterForEnv = (env) => {
  const anthropicKey = env?.ANTHROPIC_API_KEY
  if (!anthropicKey) return undefined
  const openAIKey = env?.OPENAI_API_KEY || undefined
  if (cached?.anthropicKey !== anthropicKey || cached.openAIKey !== openAIKey) {
    cached = {
      anthropicKey,
      openAIKey,
      router: createLlmRouter({
        adapters: {
          anthropic: createAnthropicAdapter(anthropicSendForKey(anthropicKey)),
          openai: createOpenAIAdapter(openAIKey ? openAISendForKey(openAIKey) : openAIUnavailable),
        },
      }),
    }
  }
  return cached.router
}
