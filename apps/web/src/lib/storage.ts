import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const memoryStorage = (): StateStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

/** localStorage when it exists and is usable (not SSR, not blocked by privacy settings); otherwise an in-memory fallback. */
export function getBrowserStorage(): StateStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__storage_probe__';
      window.localStorage.setItem(probe, probe);
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // Access throws in sandboxed iframes and some private-browsing modes.
  }
  return memoryStorage();
}

/** JSON storage for zustand's persist middleware that never touches localStorage on the server. */
export const safeJSONStorage = <S>() => createJSONStorage<S>(getBrowserStorage);

/** Reads and parses a JSON value, returning null when storage is unavailable or the value is malformed. */
export function readStoredJson<T>(key: string): T | null {
  try {
    const raw = getBrowserStorage().getItem(key);
    return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
