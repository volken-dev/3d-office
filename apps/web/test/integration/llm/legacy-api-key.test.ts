import { afterEach, describe, expect, test } from "bun:test"
import { removeLegacyApiKey } from "../../../src/integration/llm/legacy-api-key"

const store = new Map<string, string>()
const localStorageStub: Storage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key) => store.get(key) ?? null,
  key: (index) => [...store.keys()][index] ?? null,
  removeItem: (key) => {
    store.delete(key)
  },
  setItem: (key, value) => {
    store.set(key, value)
  },
}

afterEach(() => {
  store.clear()
  Reflect.deleteProperty(globalThis, "window")
})

describe("removeLegacyApiKey", () => {
  test("deletes the Gemini key earlier versions stored, and nothing else", () => {
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: localStorageStub },
      configurable: true,
    })
    store.set(
      "byok-config",
      JSON.stringify({ apiKey: "AIzaSy-test", model: "gemini-3-flash-preview" }),
    )
    store.set("team-storage", "{}")

    removeLegacyApiKey()

    expect(store.has("byok-config")).toBe(false)
    expect(store.has("team-storage")).toBe(true)
  })
})
