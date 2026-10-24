import type { NavGrid } from "../../src/office-extras"

/**
 * Builds a nav grid from a text map, one string per row (row 0 first), `.` walkable and `#`
 * blocked, packed and encoded the way agent-office ships it.
 */
export function navFromMap(
  map: readonly string[],
  { cell = 1, origin = [0, 0] }: { cell?: number; origin?: readonly [number, number] } = {},
): NavGrid {
  const rows = map.length
  const cols = map[0]?.length ?? 0
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8))
  map.forEach((line, row) => {
    Array.from(line).forEach((character, column) => {
      if (character !== ".") return
      const bitIndex = row * cols + column
      bytes[bitIndex >> 3] = (bytes[bitIndex >> 3] ?? 0) | (1 << (bitIndex & 7))
    })
  })
  return {
    origin: [origin[0], origin[1]],
    cell,
    cols,
    rows,
    inflate: 0,
    bits: Buffer.from(bytes).toString("base64"),
  }
}
