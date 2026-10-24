import { describe, expect, test } from "bun:test"
import { base64DecodedLength, decodeBase64, isBase64 } from "../src/base64"

describe("decodeBase64", () => {
  test("matches Buffer for every padding length", () => {
    for (let length = 0; length < 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, byteIndex) => (byteIndex * 37 + 11) & 0xff)
      const encoded = Buffer.from(bytes).toString("base64")
      expect(isBase64(encoded)).toBe(true)
      expect(base64DecodedLength(encoded)).toBe(length)
      expect(Array.from(decodeBase64(encoded))).toEqual(Array.from(bytes))
    }
  })

  test("refuses input that is not padded base64", () => {
    expect(() => decodeBase64("abc")).toThrow()
    expect(() => decodeBase64("ab!d")).toThrow()
    expect(() => decodeBase64("a=bc")).toThrow()
    expect(isBase64("abc")).toBe(false)
  })
})
