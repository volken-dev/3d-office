import { describe, expect, test } from "bun:test"
import { routerForEnv } from "../../src/llm/routerForEnv"

describe("routerForEnv", () => {
  test("is undefined without a Claude key", () => {
    expect(routerForEnv(undefined)).toBeUndefined()
    expect(routerForEnv({ ANTHROPIC_API_KEY: "" })).toBeUndefined()
  })

  test("reuses one router per key pair and rebuilds it when a key changes", () => {
    const first = routerForEnv({ ANTHROPIC_API_KEY: "key-a" })
    expect(routerForEnv({ ANTHROPIC_API_KEY: "key-a" })).toBe(first)
    expect(routerForEnv({ ANTHROPIC_API_KEY: "key-a", OPENAI_API_KEY: "key-o" })).not.toBe(first)
    expect(routerForEnv({ ANTHROPIC_API_KEY: "key-b" })).not.toBe(first)
  })
})
