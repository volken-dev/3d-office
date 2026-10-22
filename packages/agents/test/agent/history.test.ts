import { describe, expect, test } from "bun:test"
import { findToolPairingIssues } from "@the-delegation/shared/llm-messages"
import {
  appendToHistory,
  displayTextOf,
  lastContextText,
  toRequestMessages,
} from "../../src/agent/history"
import type { AgentMessage } from "../../src/llm/types"

const userText = (text: string): AgentMessage => ({
  role: "user",
  content: [{ type: "text", text }],
})

const callTurn = (id: string): AgentMessage => ({
  role: "assistant",
  content: [{ type: "tool_call", id, name: "complete_task", input: {} }],
})

const resultTurn = (id: string): AgentMessage => ({
  role: "user",
  content: [{ type: "tool_result", toolCallId: id, content: "ok", isError: false }],
  metadata: { internal: true },
})

describe("toRequestMessages", () => {
  test("drops display-only notices and metadata, keeping every other turn in order", () => {
    const history: AgentMessage[] = [
      userText("Start"),
      callTurn("t1"),
      {
        role: "assistant",
        content: [{ type: "text", text: "Submitted for review" }],
        metadata: { displayOnly: true, reviewTaskId: "task-1" },
      },
      resultTurn("t1"),
    ]
    const messages = toRequestMessages(history)
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Start" }] },
      { role: "assistant", content: callTurn("t1").content },
      { role: "user", content: resultTurn("t1").content },
    ])
    expect(findToolPairingIssues(messages)).toEqual([])
  })
})

describe("lastContextText", () => {
  test("finds the most recent context snapshot", () => {
    const history: AgentMessage[] = [
      { ...userText("<project_context>v1</project_context>"), metadata: { context: true } },
      userText("Go"),
      { ...userText("<project_context>v2</project_context>"), metadata: { context: true } },
      userText("Go again"),
    ]
    expect(lastContextText(history)).toBe("<project_context>v2</project_context>")
    expect(lastContextText([userText("Go")])).toBeUndefined()
  })
})

describe("displayTextOf", () => {
  test("shows text, or a note when the model only called tools", () => {
    expect(displayTextOf({ role: "assistant", content: [{ type: "text", text: "Done." }] })).toBe(
      "Done.",
    )
    expect(displayTextOf(callTurn("t1"))).toBe("Working on it...")
    expect(
      displayTextOf({
        role: "assistant",
        content: [{ type: "tool_call", id: "b", name: "set_user_brief", input: {} }],
      }),
    ).toBe("Project brief set. Let's begin.")
  })
})

describe("appendToHistory", () => {
  test("appends without trimming under the cap", () => {
    expect(appendToHistory([userText("a")], userText("b"), 5)).toHaveLength(2)
  })

  test("trims the oldest turns at a boundary that never orphans a tool result", () => {
    const history: AgentMessage[] = [
      userText("brief"),
      callTurn("t1"),
      resultTurn("t1"),
      userText("next"),
      callTurn("t2"),
      resultTurn("t2"),
    ]
    const trimmed = appendToHistory(history, userText("latest"), 5)
    expect(trimmed[0]).toEqual(userText("next"))
    expect(findToolPairingIssues(toRequestMessages(trimmed))).toEqual([])
  })
})
