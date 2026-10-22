import { DEFAULT_MODEL, MODELS, type ModelPricing } from "./constants"

export const GEMINI_PRICING: Record<string, ModelPricing> = MODELS

const DEFAULT_PRICING: ModelPricing = MODELS[DEFAULT_MODEL]

/** `modelName` may be a versioned id reported by the API (e.g. "gemini-3-flash-preview-0925"), so match by prefix. */
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  modelName: string,
): number {
  const lowerName = modelName.toLowerCase()
  const pricingKey = Object.keys(GEMINI_PRICING).find((key) => lowerName.includes(key))
  const pricing = pricingKey ? GEMINI_PRICING[pricingKey] : DEFAULT_PRICING
  return (
    (promptTokens / 1_000_000) * pricing.inputPer1M +
    (completionTokens / 1_000_000) * pricing.outputPer1M
  )
}
