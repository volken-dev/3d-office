import { DEFAULT_MODEL } from './constants';

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const GEMINI_PRICING: Record<string, ModelPricing> = {
  [DEFAULT_MODEL]: { inputPer1M: 0.50, outputPer1M: 3.00 },
  'gemini-3.1-pro-preview': { inputPer1M: 2.00, outputPer1M: 12.00 },
  'gemini-3.1-flash-lite-preview': { inputPer1M: 0.25, outputPer1M: 1.50 },
};

export const DEFAULT_PRICING: ModelPricing = GEMINI_PRICING[DEFAULT_MODEL];

export function calculateCost(promptTokens: number, completionTokens: number, modelName: string): number {
  const lowerName = modelName.toLowerCase();
  const pricingKey = Object.keys(GEMINI_PRICING).find(key => lowerName.includes(key));
  const pricing = pricingKey ? GEMINI_PRICING[pricingKey] : DEFAULT_PRICING;

  const inputCost = (promptTokens / 1000000) * pricing.inputPer1M;
  const outputCost = (completionTokens / 1000000) * pricing.outputPer1M;

  return inputCost + outputCost;
}
