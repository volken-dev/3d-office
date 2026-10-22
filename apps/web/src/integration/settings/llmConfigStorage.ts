import type { LLMConfig } from "@the-delegation/agents/llm/types"
import { DEFAULT_MODEL, isKnownModel } from "../../core/llm/constants"
import { getBrowserStorage, readStoredJson } from "../../lib/storage"

/** Where the BYOK key is persisted; only uiStore.setLlmConfig writes it. */
const LLM_CONFIG_STORAGE_KEY = "byok-config"

const DEFAULT_LLM_CONFIG: LLMConfig = { apiKey: "", model: DEFAULT_MODEL }

/** Reads the saved config, falling back to defaults for anything missing or malformed. */
export function loadLlmConfig(): LLMConfig {
  const stored = readStoredJson(LLM_CONFIG_STORAGE_KEY)
  if (typeof stored !== "object" || stored === null) return { ...DEFAULT_LLM_CONFIG }
  return {
    apiKey: "apiKey" in stored && typeof stored.apiKey === "string" ? stored.apiKey : "",
    model: "model" in stored && isKnownModel(stored.model) ? stored.model : DEFAULT_MODEL,
  }
}

/** Returns false when the browser refused to store it (the key then lives for this session only). */
export function saveLlmConfig(config: LLMConfig): boolean {
  try {
    getBrowserStorage().setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}
