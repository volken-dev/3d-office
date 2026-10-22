import { describe, expect, test } from "bun:test"
import { ModelIdSchema } from "@the-delegation/shared/llm-messages"
import {
  costOfUsage,
  DEFAULT_LEAD_MODEL_ID,
  DEFAULT_TEAM_MODEL_ID,
  findBackupModel,
  findModel,
  MODELS,
} from "../src/registry"

describe("registry", () => {
  test("ids are unique and valid for the wire contract", () => {
    const ids = MODELS.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(ModelIdSchema.safeParse(id).success).toBe(true)
  })

  test("defaults are Claude: Opus for leads, Sonnet for team agents", () => {
    expect(findModel(DEFAULT_LEAD_MODEL_ID)?.provider).toBe("anthropic")
    expect(findModel(DEFAULT_TEAM_MODEL_ID)?.provider).toBe("anthropic")
    expect(DEFAULT_LEAD_MODEL_ID).toBe("claude-opus-5-5")
    expect(DEFAULT_TEAM_MODEL_ID).toBe("claude-sonnet-5-5")
  })

  test("every Claude model fails over to a registered OpenAI model, and backups have no backup", () => {
    for (const model of MODELS) {
      const backup = findBackupModel(model)
      if (model.provider === "anthropic") {
        expect(backup?.provider).toBe("openai")
        expect(backup && findBackupModel(backup)).toBeUndefined()
      } else {
        expect(backup).toBeUndefined()
      }
    }
  })

  test("unknown ids are not served", () => {
    expect(findModel("gemini-3-flash-preview")).toBeUndefined()
  })
})

describe("costOfUsage", () => {
  test("prices each token class at its own rate", () => {
    const opus = findModel("claude-opus-5-5")
    if (!opus) throw new Error("Opus missing from registry")
    const cost = costOfUsage(opus, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    })
    expect(cost).toBeCloseTo(4 + 20 + 0.2 + 5, 10)
  })

  test("a fully cached prompt costs a tenth or less of an uncached one", () => {
    const sonnet = findModel("claude-sonnet-5-5")
    if (!sonnet) throw new Error("Sonnet missing from registry")
    const uncached = costOfUsage(sonnet, {
      inputTokens: 50_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    const cached = costOfUsage(sonnet, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 50_000,
      cacheWriteTokens: 0,
    })
    expect(cached).toBeLessThanOrEqual(uncached / 10)
  })
})
