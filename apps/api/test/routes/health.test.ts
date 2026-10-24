import { describe, expect, test } from "bun:test"
import { ApiErrorSchema, HealthResponseSchema } from "@the-delegation/shared/api"
import { createApp } from "../../src/app"

const app = createApp()

describe("GET /api/health", () => {
  test("answers ok with the server time", async () => {
    const response = await app.request("/api/health")
    expect(response.status).toBe(200)
    const body = HealthResponseSchema.parse(await response.json())
    expect(Number.isNaN(Date.parse(body.time))).toBe(false)
  })
})

describe("unknown routes", () => {
  test("answer 404 with the error envelope and a request id", async () => {
    const response = await app.request("/api/nope")
    expect(response.status).toBe(404)
    const body = ApiErrorSchema.parse(await response.json())
    expect(body.error.code).toBe("not_found")
    expect(body.error.requestId).toBeString()
  })
})
