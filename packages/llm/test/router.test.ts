import { describe, expect, test } from "bun:test"
import type {
  LlmProvider,
  MessagesRequest,
  MessagesResponse,
} from "@the-delegation/shared/llm-messages"
import type { CompletionOptions, ProviderAdapter } from "../src/adapter"
import { ProviderError, type ProviderErrorKind } from "../src/errors"
import type { ModelEntry } from "../src/registry"
import { createLlmRouter, UnknownModelError } from "../src/router"

type Outcome = "ok" | "refusal" | ProviderErrorKind

/** Adapter that plays scripted outcomes and records which models it was asked for. */
class ScriptedAdapter implements ProviderAdapter {
  readonly calls: string[] = []
  constructor(
    readonly provider: LlmProvider,
    private readonly outcomes: Outcome[] = [],
  ) {}

  async complete(
    model: ModelEntry,
    _request: MessagesRequest,
    _options?: CompletionOptions,
  ): Promise<MessagesResponse> {
    this.calls.push(model.id)
    const outcome = this.outcomes.shift() ?? "ok"
    if (outcome !== "ok" && outcome !== "refusal") {
      throw new ProviderError(outcome, this.provider, `scripted ${outcome}`)
    }
    return {
      content: [{ type: "text", text: `${model.id} says hi` }],
      stopReason: outcome === "refusal" ? "refusal" : "end_turn",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      servedBy: { provider: this.provider, model: model.id, fallback: false },
    }
  }
}

function setup(anthropicOutcomes: Outcome[], openaiOutcomes: Outcome[] = []) {
  let clock = 0
  const anthropic = new ScriptedAdapter("anthropic", anthropicOutcomes)
  const openai = new ScriptedAdapter("openai", openaiOutcomes)
  const router = createLlmRouter({
    adapters: { anthropic, openai },
    breaker: { failureThreshold: 3, cooldownMs: 30_000 },
    now: () => clock,
  })
  return {
    anthropic,
    openai,
    router,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

function request(model = "claude-opus-5-5"): MessagesRequest {
  return {
    model,
    system: "",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  }
}

describe("createLlmRouter", () => {
  test("serves the requested model when it succeeds", async () => {
    const { router, anthropic, openai } = setup([])
    const response = await router.complete(request())
    expect(response.servedBy).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      fallback: false,
    })
    expect(anthropic.calls).toEqual(["claude-opus-5-5"])
    expect(openai.calls).toEqual([])
  })

  test("fails over once to the backup on outages and marks the response", async () => {
    for (const kind of ["rate_limited", "overloaded", "unavailable"] as const) {
      const { router, openai } = setup([kind])
      const response = await router.complete(request("claude-sonnet-5-5"))
      expect(response.servedBy).toEqual({
        provider: "openai",
        model: "gpt-6.1-sol",
        fallback: true,
      })
      expect(openai.calls).toEqual(["gpt-6.1-sol"])
    }
  })

  test("does not fail over on auth, invalid requests or aborts", async () => {
    for (const kind of ["auth", "invalid_request", "aborted", "other"] as const) {
      const { router, openai } = setup([kind])
      await expect(router.complete(request())).rejects.toMatchObject({ kind })
      expect(openai.calls).toEqual([])
    }
  })

  test("returns a refusal as it is instead of switching provider", async () => {
    const { router, openai } = setup(["refusal"])
    expect((await router.complete(request())).stopReason).toBe("refusal")
    expect(openai.calls).toEqual([])
  })

  test("sends a request at most twice, even when the backup also fails", async () => {
    const { router, anthropic, openai } = setup(["unavailable"], ["unavailable"])
    await expect(router.complete(request())).rejects.toMatchObject({
      provider: "openai",
      kind: "unavailable",
    })
    expect([...anthropic.calls, ...openai.calls]).toHaveLength(2)
  })

  test("does not fail over when the caller already aborted", async () => {
    const { router, openai } = setup(["unavailable"])
    const controller = new AbortController()
    controller.abort()
    await expect(router.complete(request(), { signal: controller.signal })).rejects.toBeInstanceOf(
      ProviderError,
    )
    expect(openai.calls).toEqual([])
  })

  test("opens the circuit after repeated outages and retries the provider after the cooldown", async () => {
    const { router, anthropic, openai, advance } = setup([
      "overloaded",
      "overloaded",
      "overloaded",
      "overloaded",
    ])
    for (let i = 0; i < 3; i++) await router.complete(request())
    expect(anthropic.calls).toHaveLength(3)

    await router.complete(request())
    expect(anthropic.calls).toHaveLength(3)
    expect(openai.calls).toHaveLength(4)

    advance(30_000)
    await router.complete(request())
    expect(anthropic.calls).toHaveLength(4)

    advance(1)
    await router.complete(request())
    expect(anthropic.calls).toHaveLength(4)

    advance(30_000)
    const recovered = await router.complete(request())
    expect(recovered.servedBy.fallback).toBe(false)
    expect(anthropic.calls).toHaveLength(5)
  })

  test("a success resets the failure count", async () => {
    const { router, anthropic } = setup([
      "overloaded",
      "overloaded",
      "ok",
      "overloaded",
      "overloaded",
    ])
    for (let i = 0; i < 5; i++) await router.complete(request())
    await router.complete(request())
    expect(anthropic.calls).toHaveLength(6)
  })

  test("serves a model with no backup on its own provider only", async () => {
    const { router, anthropic } = setup([], ["unavailable"])
    await expect(router.complete(request("gpt-6-astra"))).rejects.toMatchObject({
      kind: "unavailable",
    })
    expect(anthropic.calls).toEqual([])
  })

  test("rejects a model the registry does not serve", async () => {
    const { router } = setup([])
    await expect(router.complete(request("gemini-3-flash-preview"))).rejects.toBeInstanceOf(
      UnknownModelError,
    )
  })
})
