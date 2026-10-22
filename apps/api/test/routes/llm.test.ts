import { describe, expect, test } from "bun:test"
import { ProviderError, type ProviderErrorKind } from "@the-delegation/llm/errors"
import { type LlmRouter, UnknownModelError } from "@the-delegation/llm/router"
import { type ApiError, type ApiErrorCode, ApiErrorSchema } from "@the-delegation/shared/api"
import type { MessagesRequest, MessagesResponse } from "@the-delegation/shared/llm-messages"
import { createApp } from "../../src/app"
import type { Bindings } from "../../src/env"

const REPLY: MessagesResponse = {
  content: [{ type: "text", text: "Hello." }],
  stopReason: "end_turn",
  usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
  servedBy: { provider: "anthropic", model: "claude-opus-5-5", fallback: false },
}

const BODY: MessagesRequest = {
  model: "claude-opus-5-5",
  system: "You are the tech lead.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
}

/** A router that records requests and answers with `outcome`. */
function fakeRouter(outcome: MessagesResponse | Error) {
  const received: { request: MessagesRequest; signal?: AbortSignal }[] = []
  const router: LlmRouter = {
    async complete(request, options) {
      received.push({ request, signal: options?.signal })
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  return { router, received }
}

function appWith(router: LlmRouter | undefined) {
  return createApp({ routerForEnv: () => router })
}

const ENV: Bindings = { CLIENT_IP: "203.0.113.7", RATE_LIMIT_PER_MINUTE: "100" }

function post(app: ReturnType<typeof createApp>, body: unknown, env: Bindings = ENV) {
  return app.request(
    "/api/llm/messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  )
}

async function errorOf(response: Response): Promise<ApiError["error"]> {
  return ApiErrorSchema.parse(await response.json()).error
}

describe("POST /api/llm/messages", () => {
  test("serves a valid request through the router and returns its reply", async () => {
    const { router, received } = fakeRouter(REPLY)
    const response = await post(appWith(router), BODY)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(REPLY)
    expect(received[0]?.request).toEqual(BODY)
    expect(received[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  test("answers 503 not_configured without a Claude key", async () => {
    const response = await post(appWith(undefined), BODY)
    expect(response.status).toBe(503)
    expect((await errorOf(response)).code).toBe("not_configured")
  })

  test("rejects an unanswered tool call before calling the router", async () => {
    const { router, received } = fakeRouter(REPLY)
    const response = await post(appWith(router), {
      ...BODY,
      messages: [
        ...BODY.messages,
        {
          role: "assistant",
          content: [{ type: "tool_call", id: "toolu_1", name: "propose_task", input: {} }],
        },
      ],
    })
    expect(response.status).toBe(400)
    const error = await errorOf(response)
    expect(error.code).toBe("validation_failed")
    expect(error.issues?.[0]?.message).toContain("toolu_1")
    expect(received).toEqual([])
  })

  test("rejects malformed JSON and oversized bodies", async () => {
    const { router } = fakeRouter(REPLY)
    expect((await post(appWith(router), "{not json")).status).toBe(400)
    const huge = { ...BODY, system: "x".repeat(1024 * 1024) }
    expect((await post(appWith(router), huge)).status).toBe(413)
  })

  test("maps provider failures to our error codes without leaking upstream text", async () => {
    const cases: [ProviderErrorKind, number, ApiErrorCode][] = [
      ["rate_limited", 429, "rate_limited"],
      ["overloaded", 503, "upstream_error"],
      ["unavailable", 503, "upstream_error"],
      ["auth", 503, "not_configured"],
      ["invalid_request", 400, "bad_request"],
      ["other", 502, "upstream_error"],
    ]
    for (const [kind, status, code] of cases) {
      const upstream = new ProviderError(kind, "anthropic", "invalid x-api-key sk-ant-secret")
      const response = await post(appWith(fakeRouter(upstream).router), BODY)
      const text = await response.text()
      expect(response.status).toBe(status)
      expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe(code)
      expect(text).not.toContain("sk-ant-secret")
    }
  })

  test("answers 400 for a model the registry does not serve", async () => {
    const response = await post(
      appWith(fakeRouter(new UnknownModelError("gemini-3-flash-preview")).router),
      BODY,
    )
    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe("bad_request")
  })

  test("rate limits per client IP", async () => {
    const app = appWith(fakeRouter(REPLY).router)
    const env: Bindings = { CLIENT_IP: "198.51.100.1", RATE_LIMIT_PER_MINUTE: "2" }
    expect((await post(app, BODY, env)).status).toBe(200)
    expect((await post(app, BODY, env)).status).toBe(200)
    const limited = await post(app, BODY, env)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("Retry-After")).toBeTruthy()
  })
})
