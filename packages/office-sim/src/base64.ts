const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const SEXTET_BY_CHARACTER = new Map(
  Array.from(BASE64_ALPHABET, (character, sextet) => [character, sextet] as const),
)

/**
 * The number of bytes a well-formed, padded base64 string decodes to, without decoding it, so a
 * schema can check a payload's size before allocating anything for it.
 */
export function base64DecodedLength(encoded: string): number {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0
  return (encoded.length / 4) * 3 - padding
}

/** Whether a string is standard, padded base64 (the encoding the office walk grid ships in). */
export function isBase64(encoded: string): boolean {
  return encoded.length % 4 === 0 && BASE64_PATTERN.test(encoded)
}

/**
 * Decodes standard, padded base64. Written here because the package targets plain ES2022 (no
 * `atob`, no `Buffer`), so the same code runs in a browser, a worker or on a server.
 * Throws on anything that is not well-formed base64 rather than decoding garbage.
 */
export function decodeBase64(encoded: string): Uint8Array {
  if (!isBase64(encoded)) {
    throw new Error("decodeBase64: the input is not padded base64")
  }
  const bytes = new Uint8Array(base64DecodedLength(encoded))
  let byteIndex = 0
  for (let quadStart = 0; quadStart < encoded.length; quadStart += 4) {
    let packed = 0
    for (let offset = 0; offset < 4; offset++) {
      packed = (packed << 6) | (SEXTET_BY_CHARACTER.get(encoded.charAt(quadStart + offset)) ?? 0)
    }
    const quadBytes = [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
    for (const byte of quadBytes) {
      if (byteIndex < bytes.length) {
        bytes[byteIndex] = byte
        byteIndex++
      }
    }
  }
  return bytes
}
