import { pickRandom, type RandomSource } from "../seeded-random.ts"
import { svgDocument } from "./svg-document.ts"

/** Which code screen to draw: two editor variants (`a`, `b`) share a look; `term` is a terminal. */
export type CodeScreenVariant = "a" | "b" | "term"

const WINDOW_BUTTON_COLOURS = ["#ff5f57", "#febc2e", "#28c840"]
const TERMINAL_TOKEN_COLOURS = ["#7ee787", "#56d364", "#3fb950", "#a5f3b5"]
const EDITOR_TOKEN_COLOURS = [
  "#ff7b72",
  "#79c0ff",
  "#d2a8ff",
  "#7ee787",
  "#e6edf3",
  "#ffa657",
  "#8b949e",
  "#e6edf3",
]

/**
 * A monitor showing code: a title bar, then rows of coloured token bars with a wandering indent
 * (an editor with a line-number gutter, or a terminal with prompts and a cursor block).
 */
export function codeScreenSvg(random: RandomSource, variant: CodeScreenVariant): string {
  const width = 512
  const height = 320
  const terminal = variant === "term"
  let body = `<rect width="${width}" height="${height}" fill="${terminal ? "#0a0f0c" : "#0d1117"}"/>`
  body += `<rect width="${width}" height="26" fill="${terminal ? "#111a15" : "#161b22"}"/>`
  WINDOW_BUTTON_COLOURS.forEach((colour, index) => {
    body += `<circle cx="${16 + index * 16}" cy="13" r="5" fill="${colour}"/>`
  })
  if (!terminal) body += `<rect x="0" y="26" width="34" height="${height - 26}" fill="#0b0f14"/>`
  const tokenColours = terminal ? TERMINAL_TOKEN_COLOURS : EDITOR_TOKEN_COLOURS
  let y = 40
  let indent = 0
  while (y < height - 10) {
    if (!terminal) body += `<rect x="8" y="${y}" width="16" height="6" rx="2" fill="#30363d"/>`
    if (random() < 0.12) {
      y += 14
      continue
    }
    indent = Math.max(0, Math.min(4, indent + (random() < 0.3 ? 1 : random() < 0.3 ? -1 : 0)))
    let x = (terminal ? 12 : 44) + indent * 18
    if (terminal) {
      body += `<rect x="${x}" y="${y}" width="10" height="7" rx="1.5" fill="#56d364"/>`
      x += 16
    }
    const tokenCount = 1 + Math.floor(random() * 5)
    for (let i = 0; i < tokenCount && x < width - 20; i++) {
      const tokenWidth = 14 + Math.floor(random() * 70)
      body += `<rect x="${x}" y="${y}" width="${Math.min(tokenWidth, width - 20 - x)}" height="7" rx="3" fill="${pickRandom(random, tokenColours)}"/>`
      x += tokenWidth + 7
    }
    y += 14
  }
  if (terminal) body += `<rect x="12" y="${height - 22}" width="10" height="12" fill="#a5f3b5"/>`
  return svgDocument(width, height, body)
}
