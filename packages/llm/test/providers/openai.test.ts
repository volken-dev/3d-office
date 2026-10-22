import { describe, expect, test } from "bun:test"
import type { Message, MessagesRequest } from "@the-delegation/shared/llm-messages"
import OpenAI from "openai"
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
  ResponseReasoningItem,
} from "openai/resources/responses/responses"
import { ProviderError, type ProviderErrorKind, shouldFailOver } from "../../src/errors"
import { createOpenAIAdapter, toOpenAIParams } from "../../src/providers/openai"
import { findModel, type ModelEntry } from "../../src/registry"

function requireModel(id: string): ModelEntry {
  const model = findModel(id)
  if (!model) throw new Error(`${id} missing from registry`)
  return model
}

const sol = requireModel("gpt-6.1-sol")

const brief: Message = { role: "user", content: [{ type: "text", text: "Build a login page." }] }

function request(overrides: Partial<MessagesRequest> = {}): MessagesRequest {
  return { model: sol.id, system: "You are the tech lead.", messages: [brief], ...overrides }
}

const reasoningItem: ResponseReasoningItem = {
  type: "reasoning",
  id: "rs_1",
  summary: [],
  encrypted_content: "gAAAA-opaque",
}

function responseFixture(
  output: ResponseOutputItem[],
  overrides: Partial<Response> = {},
): Response {
  return {
    id: "resp_1",
    object: "response",
    access_programs: null,
    created_at: 0,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: sol.id,
    output,
    output_text: "",
    parallel_tool_calls: true,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    status: "completed",
    usage: {
      input_tokens: 5_000,
      input_tokens_details: { cached_tokens: 4_000, cache_write_tokens: 0 },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 200 },
      total_tokens: 5_300,
    },
    ...overrides,
  }
}

function adapterReplying(reply: Response | Error) {
  const sent: ResponseCreateParamsNonStreaming[] = []
  const adapter = createOpenAIAdapter(async (params) => {
    sent.push(params)
    if (reply instanceof Error) throw reply
    return reply
  })
  return { adapter, sent }
}

describe("toOpenAIParams", () => {
  test("is stateless, sends the system prompt as instructions and applies the default effort", () => {
    const params = toOpenAIParams(sol, request())
    expect(params.model).toBe("gpt-6.1-sol")
    expect(params.instructions).toBe("You are the tech lead.")
    expect(params.store).toBe(false)
    expect(params.include).toEqual(["reasoning.encrypted_content"])
    expect(params.reasoning).toEqual({ effort: "high" })
    expect(params.max_output_tokens).toBe(64_000)
    expect(params.tool_choice).toBeUndefined()
  })

  test("marks a tool strict only when every property is required and extras are forbidden", () => {
    const params = toOpenAIParams(
      sol,
      request({
        tools: [
          {
            name: "complete_task",
            description: "Finish a task",
            inputSchema: {
              type: "object",
              properties: { taskId: { type: "string" }, output: { type: "string" } },
              required: ["taskId", "output"],
              additionalProperties: false,
            },
          },
          {
            name: "propose_task",
            description: "Add a task",
            inputSchema: {
              type: "object",
              properties: { title: { type: "string" }, agentId: { type: "integer" } },
              required: ["title"],
              additionalProperties: false,
            },
          },
        ],
      }),
    )
    expect(
      params.tools?.map((tool) => (tool.type === "function" ? tool.strict : undefined)),
    ).toEqual([true, false])
  })

  test("maps a tool loop to items in order, replays OpenAI reasoning and drops Claude's", () => {
    const params = toOpenAIParams(
      sol,
      request({
        messages: [
          brief,
          {
            role: "assistant",
            content: [
              { type: "reasoning", provider: "anthropic", payload: { type: "thinking" } },
              { type: "reasoning", provider: "openai", payload: reasoningItem },
              { type: "text", text: "Planning." },
              { type: "tool_call", id: "call_1", name: "propose_task", input: { title: "Form" } },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                toolCallId: "call_1",
                content: "Board is full",
                isError: true,
              },
            ],
          },
        ],
      }),
    )
    expect(params.input).toEqual([
      { type: "message", role: "user", content: "Build a login page." },
      reasoningItem,
      { type: "message", role: "assistant", content: "Planning." },
      {
        type: "function_call",
        call_id: "call_1",
        name: "propose_task",
        arguments: '{"title":"Form"}',
      },
      { type: "function_call_output", call_id: "call_1", output: "Error: Board is full" },
    ])
  })
})

describe("createOpenAIAdapter", () => {
  test("maps output items in order and reports cached tokens apart from uncached input", async () => {
    const { adapter } = adapterReplying(
      responseFixture([
        reasoningItem,
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Planning.", annotations: [] }],
        },
        {
          type: "function_call",
          call_id: "call_7",
          name: "propose_task",
          arguments: '{"title":"API"}',
        },
      ]),
    )

    const response = await adapter.complete(sol, request())

    expect(response.content).toEqual([
      { type: "reasoning", provider: "openai", payload: reasoningItem },
      { type: "text", text: "Planning." },
      { type: "tool_call", id: "call_7", name: "propose_task", input: { title: "API" } },
    ])
    expect(response.stopReason).toBe("tool_use")
    expect(response.usage).toEqual({
      inputTokens: 1_000,
      outputTokens: 300,
      cacheReadTokens: 4_000,
      cacheWriteTokens: 0,
    })
    expect(response.servedBy).toEqual({ provider: "openai", model: "gpt-6.1-sol", fallback: false })
  })

  test("turns malformed function arguments into an empty object", async () => {
    const { adapter } = adapterReplying(
      responseFixture([{ type: "function_call", call_id: "c", name: "note", arguments: "{oops" }]),
    )
    const response = await adapter.complete(sol, request())
    expect(response.content[0]).toEqual({ type: "tool_call", id: "c", name: "note", input: {} })
  })

  test("reports refusals and truncation", async () => {
    const refusal = adapterReplying(
      responseFixture([
        {
          type: "message",
          id: "msg_2",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "I can't help with that." }],
        },
      ]),
    )
    expect((await refusal.adapter.complete(sol, request())).stopReason).toBe("refusal")

    const truncated = adapterReplying(
      responseFixture([], {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    )
    expect((await truncated.adapter.complete(sol, request())).stopReason).toBe("max_tokens")
  })

  test("a failed response is an unavailable provider error", async () => {
    const { adapter } = adapterReplying(
      responseFixture([], {
        status: "failed",
        error: { code: "server_error", message: "internal" },
      }),
    )
    const error = await adapter.complete(sol, request()).catch((caught: unknown) => caught)
    expect(error instanceof ProviderError && error.kind).toBe("unavailable")
  })

  test("classifies SDK errors with the same kinds as the Anthropic adapter", async () => {
    const cases: [Error, ProviderErrorKind, boolean][] = [
      [
        OpenAI.APIError.generate(
          429,
          { error: { type: "rate_limit" } },
          "slow down",
          new Headers(),
        ),
        "rate_limited",
        true,
      ],
      [
        OpenAI.APIError.generate(503, { error: { type: "server_error" } }, "down", new Headers()),
        "unavailable",
        true,
      ],
      [new OpenAI.APIConnectionError({ message: "reset" }), "unavailable", true],
      [
        OpenAI.APIError.generate(
          401,
          { error: { type: "invalid_api_key" } },
          "bad key",
          new Headers(),
        ),
        "auth",
        false,
      ],
      [
        OpenAI.APIError.generate(
          400,
          { error: { type: "invalid_request_error" } },
          "bad",
          new Headers(),
        ),
        "invalid_request",
        false,
      ],
      [new OpenAI.APIUserAbortError({ message: "aborted" }), "aborted", false],
    ]
    for (const [upstream, kind, failsOver] of cases) {
      const { adapter } = adapterReplying(upstream)
      const error = await adapter.complete(sol, request()).catch((caught: unknown) => caught)
      expect(error instanceof ProviderError && error.kind).toBe(kind)
      expect(shouldFailOver(error)).toBe(failsOver)
    }
  })
})
