import { describe, expect, test } from "bun:test"
import { assetUrlFor } from "../src/loaders"

describe("assetUrlFor", () => {
  test("joins a base URL and an asset path with exactly one slash", () => {
    expect(assetUrlFor("/", "models/office.glb")).toBe("/models/office.glb")
    expect(assetUrlFor("", "models/office.glb")).toBe("/models/office.glb")
    expect(assetUrlFor("/viewer/", "/models/robot.glb")).toBe("/viewer/models/robot.glb")
    expect(assetUrlFor("http://localhost:5173", "models/robot.glb")).toBe(
      "http://localhost:5173/models/robot.glb",
    )
  })
})
