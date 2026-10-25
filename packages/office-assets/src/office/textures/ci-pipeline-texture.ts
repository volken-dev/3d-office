import type { RandomSource } from "../seeded-random.ts"
import { svgDocument } from "./svg-document.ts"

/**
 * A CI pipeline screen: six rows of five stage pills, green, with one failed run (red, then grey
 * stages it never reached) and one stage still running (amber).
 */
export function ciPipelineSvg(random: RandomSource): string {
  const width = 496
  const height = 240
  let body = `<rect width="${width}" height="${height}" fill="#0d1117"/><rect width="${width}" height="26" fill="#161b22"/><rect x="12" y="9" width="70" height="8" rx="4" fill="#e6edf3"/>`
  body += `<rect x="${width - 70}" y="7" width="58" height="12" rx="6" fill="#238636"/>`
  for (let row = 0; row < 6; row++) {
    const y = 40 + row * 32
    const failed = row === 2
    body += `<rect x="12" y="${y + 6}" width="${50 + random() * 40}" height="8" rx="4" fill="#8b949e"/>`
    for (let stage = 0; stage < 5; stage++) {
      const colour =
        failed && stage === 3
          ? "#f85149"
          : failed && stage > 3
            ? "#30363d"
            : row === 5 && stage === 4
              ? "#d29922"
              : "#3fb950"
      body += `<rect x="${140 + stage * 68}" y="${y}" width="58" height="20" rx="10" fill="${colour}"/>`
      if (stage) {
        body += `<rect x="${132 + stage * 68}" y="${y + 9}" width="8" height="2" fill="#30363d"/>`
      }
    }
  }
  return svgDocument(width, height, body)
}
