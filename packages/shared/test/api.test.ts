import { describe, expect, test } from "bun:test"
import { ApiErrorSchema, HealthResponseSchema } from "../src/api"

describe("HealthResponseSchema", () => {
  test("accepts an ok status with a time and rejects anything else", () => {
    expect(
      HealthResponseSchema.safeParse({ status: "ok", time: "2026-10-24T00:00:00Z" }).success,
    ).toBe(true)
    expect(HealthResponseSchema.safeParse({ status: "down", time: "" }).success).toBe(false)
  })
})

describe("ApiErrorSchema", () => {
  test("only accepts known error codes", () => {
    expect(ApiErrorSchema.safeParse({ error: { code: "not_found", message: "x" } }).success).toBe(
      true,
    )
    expect(ApiErrorSchema.safeParse({ error: { code: "teapot", message: "x" } }).success).toBe(
      false,
    )
  })
})
