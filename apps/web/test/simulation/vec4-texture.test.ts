import { describe, expect, test } from "bun:test"
import { MAX_TEXTURE_SIDE, Vec4Texture } from "../../src/simulation/Vec4Texture"

describe("Vec4Texture", () => {
  test("a short list is one row whose data is exactly the records", () => {
    const records = new Vec4Texture(6)
    expect(records.texture.image.width).toBe(6)
    expect(records.texture.image.height).toBe(1)
    expect(records.array.length).toBe(24)
    expect(records.texture.image.data).toBe(records.array)
  })

  test("a long list wraps into whole rows of the maximum width", () => {
    const records = new Vec4Texture(MAX_TEXTURE_SIDE * 2 + 1)
    expect(records.texture.image.width).toBe(MAX_TEXTURE_SIDE)
    expect(records.texture.image.height).toBe(3)
    expect(records.array.length).toBe(MAX_TEXTURE_SIDE * 3 * 4)
  })

  test("refuses more records than a WebGL2 texture can hold", () => {
    expect(() => new Vec4Texture(MAX_TEXTURE_SIDE * MAX_TEXTURE_SIDE + 1)).toThrow()
  })
})
