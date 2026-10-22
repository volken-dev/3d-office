import { createJSONStorage, type StateStorage } from "zustand/middleware"

function memoryStorage(): StateStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/**
 * localStorage when it exists and is usable; otherwise an in-memory fallback. It is unusable
 * during SSR, and access throws in sandboxed iframes and some private-browsing modes.
 */
export function getBrowserStorage(): StateStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = "__storage_probe__"
      window.localStorage.setItem(probe, probe)
      window.localStorage.removeItem(probe)
      return window.localStorage
    }
  } catch {}
  return memoryStorage()
}

/** JSON storage for zustand's persist middleware that never touches localStorage on the server. */
export function safeJSONStorage<S>() {
  return createJSONStorage<S>(getBrowserStorage)
}

/**
 * Reads and parses a JSON value, returning null when storage is unavailable or the value is
 * malformed. The result is untrusted, so callers must validate its shape.
 */
export function readStoredJson(key: string): unknown {
  try {
    const raw = getBrowserStorage().getItem(key)
    return typeof raw === "string" ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
