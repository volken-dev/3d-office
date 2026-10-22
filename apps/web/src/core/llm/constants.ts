export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
}

/** Single source of truth for selectable models and their USD pricing per 1M tokens. */
export const MODELS = {
  "gemini-3-flash-preview": { inputPer1M: 0.5, outputPer1M: 3.0 },
  "gemini-3.1-pro-preview": { inputPer1M: 2.0, outputPer1M: 12.0 },
  "gemini-3.1-flash-lite-preview": { inputPer1M: 0.25, outputPer1M: 1.5 },
} as const satisfies Record<string, ModelPricing>

export type ModelId = keyof typeof MODELS

export const DEFAULT_MODEL: ModelId = "gemini-3-flash-preview"

export const AVAILABLE_MODELS: ModelId[] = Object.keys(MODELS).filter(isKnownModel)

/** Narrows persisted or user-supplied model ids to the ones we can price and offer. */
export function isKnownModel(value: unknown): value is ModelId {
  return typeof value === "string" && Object.hasOwn(MODELS, value)
}
