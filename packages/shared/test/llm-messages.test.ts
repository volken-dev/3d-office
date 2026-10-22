import { describe, expect, test } from "bun:test"
import {
  findToolPairingIssues,
  type Message,
  MessageSchema,
  MessagesRequestSchema,
  MessagesResponseSchema,
} from "../src/llm-messages"

const callTurn: Message = {
  role: "assistant",
  content: [
    { type: "text", text: "Planning." },
    { type: "tool_call", id: "call-1", name: "propose_task", input: { title: "Form" } },
    { type: "tool_call", id: "call-2", name: "propose_task", input: { title: "API" } },
  ],
}

const resultTurn: Message = {
  role: "user",
  content: [
    { type: "tool_result", toolCallId: "call-1", content: "Added", isError: false },
    { type: "tool_result", toolCallId: "call-2", content: "Board is full", isError: true },
  ],
}

function request(messages: Message[]) {
  return { model: "claude-opus-5-5", system: "You are the tech lead.", messages }
}

describe("MessageSchema", () => {
  test("accepts each block in the role that may send it", () => {
    expect(MessageSchema.safeParse(callTurn).success).toBe(true)
    expect(MessageSchema.safeParse(resultTurn).success).toBe(true)
  })

  test("rejects tool calls from the user and tool results from the assistant", () => {
    const userCall = { role: "user", content: [callTurn.content[1]] }
    const assistantResult = { role: "assistant", content: [resultTurn.content[0]] }
    expect(MessageSchema.safeParse(userCall).success).toBe(false)
    expect(MessageSchema.safeParse(assistantResult).success).toBe(false)
  })

  test("rejects tool call input that is not an object", () => {
    const stringInput = {
      role: "assistant",
      content: [{ type: "tool_call", id: "call-1", name: "propose_task", input: '{"title":"x"}' }],
    }
    expect(MessageSchema.safeParse(stringInput).success).toBe(false)
  })

  test("rejects oversized reasoning payloads", () => {
    const huge = {
      role: "assistant",
      content: [
        { type: "reasoning", provider: "anthropic", payload: { data: "x".repeat(200_001) } },
      ],
    }
    expect(MessageSchema.safeParse(huge).success).toBe(false)
  })
})

describe("findToolPairingIssues", () => {
  const brief: Message = { role: "user", content: [{ type: "text", text: "Start." }] }

  test("accepts a conversation where every call is answered next turn", () => {
    expect(findToolPairingIssues([brief, callTurn, resultTurn])).toEqual([])
  })

  test("flags a call with no result, including a trailing unanswered call", () => {
    const partial: Message = { role: "user", content: [resultTurn.content[0]] }
    expect(findToolPairingIssues([brief, callTurn, partial])).toEqual([
      {
        messageIndex: 1,
        message: 'Tool call "call-2" has no tool result in the next user message',
      },
    ])
    expect(findToolPairingIssues([brief, callTurn])).toHaveLength(2)
  })

  test("flags a result that answers no call from the previous assistant turn", () => {
    expect(findToolPairingIssues([brief, resultTurn]).map((issue) => issue.messageIndex)).toEqual([
      1, 1,
    ])
  })
})

describe("MessagesRequestSchema", () => {
  test("accepts a paired conversation", () => {
    const brief: Message = { role: "user", content: [{ type: "text", text: "Start." }] }
    expect(MessagesRequestSchema.safeParse(request([brief, callTurn, resultTurn])).success).toBe(
      true,
    )
  })

  test("rejects a conversation that starts with the assistant or leaves a call unanswered", () => {
    expect(MessagesRequestSchema.safeParse(request([callTurn, resultTurn])).success).toBe(false)
    const brief: Message = { role: "user", content: [{ type: "text", text: "Start." }] }
    expect(MessagesRequestSchema.safeParse(request([brief, callTurn])).success).toBe(false)
  })

  test("rejects model ids outside the allowed shape", () => {
    const brief: Message = { role: "user", content: [{ type: "text", text: "Start." }] }
    const body = { ...request([brief]), model: "../../etc/passwd" }
    expect(MessagesRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe("MessagesResponseSchema", () => {
  test("requires usage with cache counts and who served the response", () => {
    const response = {
      content: [{ type: "text", text: "Done." }],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 0 },
      servedBy: { provider: "anthropic", model: "claude-opus-5-5", fallback: false },
    }
    expect(MessagesResponseSchema.safeParse(response).success).toBe(true)
    const { servedBy: _servedBy, ...withoutServedBy } = response
    expect(MessagesResponseSchema.safeParse(withoutServedBy).success).toBe(false)
  })
})
