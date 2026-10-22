import type { Effort, LlmProvider, Usage } from "@the-delegation/shared/llm-messages"

/** US dollars per million tokens. `cacheWritePer1M` is 0 where the provider does not bill cache writes. */
export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  cacheReadPer1M: number
  cacheWritePer1M: number
}

export interface ModelEntry {
  id: string
  provider: LlmProvider
  label: string
  pricing: ModelPricing
  contextTokens: number
  maxOutputTokens: number
  effortLevels: readonly Effort[]
  /** Model the gateway fails over to when this model's provider is down; none for backup-only providers. */
  backupModelId?: string
}

const ALL_EFFORT_LEVELS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"]

/**
 * Models the gateway serves, with prices checked on 2026-10-23 against the Anthropic Claude API skill's
 * model table and https://developers.openai.com/api/docs/pricing (standard tier, short context).
 * Anthropic cache writes are billed at 1.25x input for the 5-minute cache. Change prices only from those
 * sources; the gateway's spend cap is computed from them.
 */
export const MODELS: readonly ModelEntry[] = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    pricing: { inputPer1M: 4, outputPer1M: 20, cacheReadPer1M: 0.2, cacheWritePer1M: 5 },
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    effortLevels: ALL_EFFORT_LEVELS,
    backupModelId: "gpt-6.1-sol",
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    pricing: { inputPer1M: 2, outputPer1M: 10, cacheReadPer1M: 0.2, cacheWritePer1M: 2.5 },
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    effortLevels: ALL_EFFORT_LEVELS,
    backupModelId: "gpt-6.1-sol",
  },
  {
    id: "gpt-6-astra",
    provider: "openai",
    label: "GPT-6 Astra",
    pricing: { inputPer1M: 10, outputPer1M: 50, cacheReadPer1M: 1, cacheWritePer1M: 0 },
    contextTokens: 1_050_000,
    maxOutputTokens: 128_000,
    effortLevels: ALL_EFFORT_LEVELS,
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    label: "GPT-6.1 Sol",
    pricing: { inputPer1M: 2, outputPer1M: 10, cacheReadPer1M: 0.1, cacheWritePer1M: 0 },
    contextTokens: 1_050_000,
    maxOutputTokens: 128_000,
    effortLevels: ALL_EFFORT_LEVELS,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    pricing: { inputPer1M: 0.1, outputPer1M: 0.5, cacheReadPer1M: 0.01, cacheWritePer1M: 0 },
    contextTokens: 1_050_000,
    maxOutputTokens: 128_000,
    effortLevels: ALL_EFFORT_LEVELS,
  },
]

/** Default for lead agents, which plan the work and synthesise the deliverable. */
export const DEFAULT_LEAD_MODEL_ID = "claude-opus-5-5"
/** Default for team agents, which execute individual tasks. */
export const DEFAULT_TEAM_MODEL_ID = "claude-sonnet-5-5"

const MODELS_BY_ID: ReadonlyMap<string, ModelEntry> = new Map(
  MODELS.map((model) => [model.id, model]),
)

/** The registry entry for an exact model id, or undefined when the gateway does not serve it. */
export function findModel(modelId: string): ModelEntry | undefined {
  return MODELS_BY_ID.get(modelId)
}

/** The model a request fails over to, or undefined when the model has no backup. */
export function findBackupModel(model: ModelEntry): ModelEntry | undefined {
  return model.backupModelId ? MODELS_BY_ID.get(model.backupModelId) : undefined
}

/** Cost of one call in US dollars from its reported usage; cache reads and writes use their own rates. */
export function costOfUsage(model: ModelEntry, usage: Usage): number {
  const { inputPer1M, outputPer1M, cacheReadPer1M, cacheWritePer1M } = model.pricing
  return (
    (usage.inputTokens * inputPer1M +
      usage.outputTokens * outputPer1M +
      usage.cacheReadTokens * cacheReadPer1M +
      usage.cacheWriteTokens * cacheWritePer1M) /
    1_000_000
  )
}
