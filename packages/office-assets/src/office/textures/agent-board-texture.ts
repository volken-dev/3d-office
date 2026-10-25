import { glyphRows } from "../pixel-font.ts"
import { svgDocument } from "./svg-document.ts"

/** SVG rects for `text` in the pixel font, top-left at (x, y), `pixelSize` px per font pixel. */
function pixelTextSvg(text: string, x: number, y: number, pixelSize: number, fill: string): string {
  let body = ""
  ;[...text].forEach((character, characterIndex) => {
    glyphRows(character).forEach((row, rowIndex) => {
      ;[...row].forEach((pixel, columnIndex) => {
        if (pixel === "#") {
          body += `<rect x="${x + (characterIndex * 6 + columnIndex) * pixelSize}" y="${y + rowIndex * pixelSize}" width="${pixelSize - 0.6}" height="${pixelSize - 0.6}" fill="${fill}"/>`
        }
      })
    })
  })
  return body
}

/** The baked sample's rows: agent, where it is, when. */
const SAMPLE_ROWS = [
  ["AGENT 03", "FACTORY 05", "NOW"],
  ["AGENT 07", "DOCK 07", "12:50"],
  ["AGENT 01", "DESK 01", "12:55"],
  ["AGENT 10", "MEETING", "13:00"],
  ["AGENT 04", "DOCK 04", "13:10"],
  ["AGENT 06", "FACTORY 02", "13:20"],
]

/**
 * The agent board on the lobby wall, as a baked sample (the product redraws it live into material
 * `agent_board`): pixel text, white and cyan on navy. No status colours: those belong to the robots.
 */
export function agentBoardSvg(): string {
  const width = 512
  const height = 288
  let body = `<rect width="${width}" height="${height}" fill="#0e1422"/><rect width="${width}" height="40" fill="#18223a"/>`
  body +=
    pixelTextSvg("AGENT BOARD", 16, 12, 3, "#f1f2f3") +
    pixelTextSvg("12:45", width - 16 - 29 * 3, 12, 3, "#3fe0ff")
  SAMPLE_ROWS.forEach(([agent, destination, time], rowIndex) => {
    const y = 54 + rowIndex * 38
    if (rowIndex % 2 === 0) {
      body += `<rect x="0" y="${y - 7}" width="${width}" height="36" fill="#131b2d"/>`
    }
    body +=
      pixelTextSvg(agent, 16, y, 3, "#c9d1d9") +
      pixelTextSvg(destination, 176, y, 3, "#f1f2f3") +
      pixelTextSvg(
        time,
        width - 16 - (time.length * 6 - 1) * 3,
        y,
        3,
        rowIndex === 0 ? "#3fe0ff" : "#8b95a3",
      )
  })
  return svgDocument(width, height, body)
}
