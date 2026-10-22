import { getBrowserStorage } from "../../lib/storage"

/** Where the removed BYOK dialog stored the user's Gemini key. */
const LEGACY_API_KEY_STORAGE_KEY = "byok-config"

/**
 * Deletes the Gemini key earlier versions saved in localStorage. Model calls now go through the gateway, so the key
 * is never read again and should not linger on a shared origin.
 */
export function removeLegacyApiKey(): void {
  try {
    getBrowserStorage().removeItem(LEGACY_API_KEY_STORAGE_KEY)
  } catch {}
}
