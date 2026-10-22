import type { Usage } from "@the-delegation/shared/llm-messages"

/** Every input token the call was billed for: uncached, read from the cache and written to it. */
export function promptTokensOf(usage: Usage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** All tokens of a call or a running total. */
export function totalTokensOf(usage: Usage): number {
  return promptTokensOf(usage) + usage.outputTokens
}
