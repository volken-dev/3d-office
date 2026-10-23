import { describe, expect, test } from "bun:test"
import { z } from "zod"
import {
  optionalFlag,
  optionalInteger,
  parseToolArgs,
  requiredText,
  toToolInputSchema,
} from "../../../src/agent/tools/toolArgs"

const titleArgs = z.strictObject({ title: requiredText(20) })
const assigneeArgs = z.strictObject({ agentId: optionalInteger(), urgent: optionalFlag() })

describe("requiredText", () => {
  test("returns the trimmed value", () => {
    expect(parseToolArgs(titleArgs, { title: "  Ship it  " })).toEqual({
      ok: true,
      value: { title: "Ship it" },
    })
  })

  test("rejects missing, blank and non-string values", () => {
    for (const raw of [{}, { title: "   " }, { title: 42 }, { title: null }]) {
      expect(parseToolArgs(titleArgs, raw)).toEqual({
        ok: false,
        error: '"title" must be a non-empty string.',
      })
    }
  })

  test("rejects values over the length cap", () => {
    expect(parseToolArgs(titleArgs, { title: "x".repeat(21) })).toEqual({
      ok: false,
      error: '"title" is too long (max 20 characters).',
    })
  })
})

describe("optionalInteger", () => {
  test("treats missing, null and empty values as absent", () => {
    for (const raw of [{}, { agentId: null }, { agentId: "" }]) {
      expect(parseToolArgs(assigneeArgs, raw)).toEqual({ ok: true, value: {} })
    }
  })

  test("accepts integers and quoted integers", () => {
    expect(parseToolArgs(assigneeArgs, { agentId: 3 })).toEqual({ ok: true, value: { agentId: 3 } })
    expect(parseToolArgs(assigneeArgs, { agentId: " 3 " })).toEqual({
      ok: true,
      value: { agentId: 3 },
    })
  })

  test("rejects booleans, fractions and other strings instead of coercing them", () => {
    for (const agentId of [true, false, 1.5, "1e1", "three", [3]]) {
      expect(parseToolArgs(assigneeArgs, { agentId })).toEqual({
        ok: false,
        error: '"agentId" must be an integer.',
      })
    }
  })
})

describe("parseToolArgs", () => {
  test("rejects arguments the schema does not declare", () => {
    expect(parseToolArgs(titleArgs, { title: "Ship it", force: true })).toEqual({
      ok: false,
      error: 'Unknown argument: "force".',
    })
  })

  test("reports every problem at once", () => {
    const result = parseToolArgs(assigneeArgs, { agentId: true, urgent: "yes" })
    expect(result).toEqual({
      ok: false,
      error: '"agentId" must be an integer. "urgent" must be true or false.',
    })
  })
})

describe("toToolInputSchema", () => {
  test("keeps structure and descriptions but drops keywords strict tools reject", () => {
    const schema = z.strictObject({
      title: requiredText(20).describe("Short title"),
      agentId: optionalInteger().describe("Agent index"),
    })
    expect(toToolInputSchema(schema)).toEqual({
      type: "object",
      properties: {
        title: { type: "string", description: "Short title" },
        agentId: { type: "integer", description: "Agent index" },
      },
      required: ["title"],
      additionalProperties: false,
    })
  })
})
