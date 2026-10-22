import { describe, expect, test } from "bun:test"
import { HealthResponseSchema } from "@the-delegation/shared/api"
import { createApp } from "../../src/app"

const app = createApp({ routerForEnv: () => undefined })

async function health(env: Record<string, string>) {
  const response = await app.request("/api/health", {}, env)
  return HealthResponseSchema.parse(await response.json())
}

describe("GET /api/health", () => {
  test("reports which providers have keys without exposing them", async () => {
    expect((await health({})).llm).toEqual({ configured: false, fallback: false })
    const both = await health({ ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-y" })
    expect(both.llm).toEqual({ configured: true, fallback: true })
    expect(JSON.stringify(both)).not.toContain("sk-")
  })
})
