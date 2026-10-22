import { describe, expect, test } from "bun:test"
import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import type { Message, MessagesRequest } from "@the-delegation/shared/llm-messages"
import { ProviderError, type ProviderErrorKind, shouldFailOver } from "../../src/errors"
import { createAnthropicAdapter, toAnthropicParams } from "../../src/providers/anthropic"
import { findModel, type ModelEntry } from "../../src/registry"

function requireModel(id: string): ModelEntry {
  const model = findModel(id)
  if (!model) throw new Error(`${id} missing from registry`)
  return model
}

const opus = requireModel("claude-opus-5-5")

const brief: Message = { role: "user", content: [{ type: "text", text: "Build a login page." }] }

function request(overrides: Partial<MessagesRequest> = {}): MessagesRequest {
  return { model: opus.id, system: "You are the tech lead.", messages: [brief], ...overrides }
}

const thinkingBlock: BetaContentBlock = {
  type: "thinking",
  thinking: "",
  signature: "sig-abc123",
}

function messageFixture(
  content: BetaContentBlock[],
  overrides: Partial<BetaMessage> = {},
): BetaMessage {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: opus.id,
    content,
    container: null,
    context_management: null,
    diagnostics: null,
    stop_details: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      cache_read_input_tokens: 3000,
      cache_creation_input_tokens: null,
      cache_creation: null,
      fallback_credit: null,
      inference_geo: null,
      iterations: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
    ...overrides,
  }
}

/** An adapter whose transport records the params it was given and replies with `reply`. */
function adapterReplying(reply: BetaMessage | Error) {
  const sent: BetaMessageStreamParams[] = []
  const adapter = createAnthropicAdapter(async (params) => {
    sent.push(params)
    if (reply instanceof Error) throw reply
    return reply
  })
  return { adapter, sent }
}

describe("toAnthropicParams", () => {
  test("sends adaptive thinking with drop_block, explicit effort, prompt caching and the refusal fallback", () => {
    const params = toAnthropicParams(opus, request())
    expect(params.model).toBe("claude-opus-5-5")
    expect(params.thinking).toEqual({
      type: "adaptive",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    })
    expect(params.output_config).toEqual({ effort: "high" })
    expect(params.cache_control).toEqual({ type: "ephemeral" })
    expect(params.fallbacks).toBe("default")
    expect(params.betas).toEqual([
      "server-side-fallback-2026-07-01",
      "thinking-binding-controls-2026-08-01",
    ])
    expect(params.tool_choice).toBeUndefined()
  })

  test("uses the request's effort and caps max_tokens at the model's limit", () => {
    const params = toAnthropicParams(opus, request({ effort: "low", maxOutputTokens: 1_000 }))
    expect(params.output_config).toEqual({ effort: "low" })
    expect(params.max_tokens).toBe(1_000)
    expect(toAnthropicParams(opus, request()).max_tokens).toBe(64_000)
  })

  test("marks a tool strict only when its schema forbids extra properties", () => {
    const params = toAnthropicParams(
      opus,
      request({
        tools: [
          {
            name: "complete_task",
            description: "Finish a task",
            inputSchema: {
              type: "object",
              properties: { taskId: { type: "string" } },
              required: ["taskId"],
              additionalProperties: false,
            },
          },
          {
            name: "note",
            description: "Leave a note",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
          },
        ],
      }),
    )
    expect(params.tools?.map((tool) => ("strict" in tool ? tool.strict : undefined))).toEqual([
      true,
      undefined,
    ])
  })

  test("rejects a tool whose input schema is not an object", () => {
    expect(() =>
      toAnthropicParams(
        opus,
        request({ tools: [{ name: "bad", description: "x", inputSchema: { type: "string" } }] }),
      ),
    ).toThrow(ProviderError)
  })

  test("maps tool calls and results, replays Claude reasoning in place and drops other providers'", () => {
    const params = toAnthropicParams(
      opus,
      request({
        messages: [
          brief,
          {
            role: "assistant",
            content: [
              { type: "reasoning", provider: "anthropic", payload: thinkingBlock },
              { type: "reasoning", provider: "openai", payload: { id: "rs_1" } },
              { type: "tool_call", id: "toolu_1", name: "propose_task", input: { title: "Form" } },
            ],
          },
          {
            role: "user",
            content: [
              { type: "tool_result", toolCallId: "toolu_1", content: "Added", isError: false },
            ],
          },
          { role: "assistant", content: [{ type: "reasoning", provider: "openai", payload: {} }] },
          { role: "user", content: [{ type: "text", text: "Go on." }] },
        ],
      }),
    )
    expect(params.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Build a login page." }] },
      {
        role: "assistant",
        content: [
          thinkingBlock,
          { type: "tool_use", id: "toolu_1", name: "propose_task", input: { title: "Form" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "Added", is_error: false },
        ],
      },
      { role: "user", content: [{ type: "text", text: "Go on." }] },
    ])
  })
})

describe("createAnthropicAdapter", () => {
  test("maps the reply in order, keeping thinking blocks byte for byte for the next turn", async () => {
    const reply = messageFixture(
      [
        thinkingBlock,
        { type: "text", text: "Planning.", citations: null },
        { type: "tool_use", id: "toolu_9", name: "propose_task", input: { title: "API" } },
      ],
      { stop_reason: "tool_use" },
    )
    const { adapter } = adapterReplying(reply)

    const response = await adapter.complete(opus, request())

    expect(response.content.map((block) => block.type)).toEqual(["reasoning", "text", "tool_call"])
    expect(response.stopReason).toBe("tool_use")
    expect(response.usage).toEqual({
      inputTokens: 120,
      outputTokens: 40,
      cacheReadTokens: 3000,
      cacheWriteTokens: 0,
    })
    expect(response.servedBy).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      fallback: false,
    })

    const replayed = toAnthropicParams(
      opus,
      request({ messages: [brief, { role: "assistant", content: response.content }] }),
    )
    const assistantContent = replayed.messages[1]?.content
    expect(Array.isArray(assistantContent) && JSON.stringify(assistantContent[0])).toBe(
      JSON.stringify(thinkingBlock),
    )
  })

  test("reports a refusal and the model that served a server-side fallback", async () => {
    const { adapter } = adapterReplying(
      messageFixture([], { stop_reason: "refusal", model: "claude-opus-4-8" }),
    )
    const response = await adapter.complete(opus, request())
    expect(response.stopReason).toBe("refusal")
    expect(response.servedBy.model).toBe("claude-opus-4-8")
  })

  test("never passes non-object tool input through", async () => {
    const { adapter } = adapterReplying(
      messageFixture([{ type: "tool_use", id: "toolu_2", name: "note", input: "oops" }]),
    )
    const response = await adapter.complete(opus, request())
    expect(response.content[0]).toEqual({
      type: "tool_call",
      id: "toolu_2",
      name: "note",
      input: {},
    })
  })

  test("classifies SDK errors so only outages fail over", async () => {
    const cases: [Error, ProviderErrorKind, boolean][] = [
      [
        Anthropic.APIError.generate(
          429,
          { error: { type: "rate_limit_error" } },
          "slow down",
          new Headers(),
        ),
        "rate_limited",
        true,
      ],
      [
        Anthropic.APIError.generate(
          529,
          { error: { type: "overloaded_error" } },
          "overloaded",
          new Headers(),
        ),
        "overloaded",
        true,
      ],
      [
        Anthropic.APIError.generate(500, { error: { type: "api_error" } }, "boom", new Headers()),
        "unavailable",
        true,
      ],
      [new Anthropic.APIConnectionError({ message: "socket hang up" }), "unavailable", true],
      [
        Anthropic.APIError.generate(
          401,
          { error: { type: "authentication_error" } },
          "bad key",
          new Headers(),
        ),
        "auth",
        false,
      ],
      [
        Anthropic.APIError.generate(
          400,
          { error: { type: "invalid_request_error" } },
          "bad",
          new Headers(),
        ),
        "invalid_request",
        false,
      ],
      [new Anthropic.APIUserAbortError({ message: "aborted" }), "aborted", false],
    ]
    for (const [upstream, kind, failsOver] of cases) {
      const { adapter } = adapterReplying(upstream)
      const error = await adapter.complete(opus, request()).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ProviderError)
      expect(error instanceof ProviderError && error.kind).toBe(kind)
      expect(shouldFailOver(error)).toBe(failsOver)
    }
  })

  test("keeps the upstream message out of the error message", async () => {
    const { adapter } = adapterReplying(
      Anthropic.APIError.generate(
        401,
        { error: { type: "authentication_error" } },
        "invalid x-api-key sk-ant-123",
        new Headers(),
      ),
    )
    const error = await adapter.complete(opus, request()).catch((caught: unknown) => caught)
    expect(error instanceof ProviderError && error.message).toBe("anthropic request failed: auth")
  })
})
