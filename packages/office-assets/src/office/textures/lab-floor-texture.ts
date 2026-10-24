import { svgDocument } from "./svg-document.ts"

/** Corner screw positions within a 128 px panel. */
const PANEL_SCREWS = [
  [10, 10],
  [118, 10],
  [10, 118],
  [118, 118],
]

/**
 * The lab floor: pale raised-access panels, 2 x 2 per tile (one tile is 1.2 m), the one floor for
 * the whole office. `perforated` is the docking-bay variant: the same panels, alternate ones
 * perforated for cooling.
 */
export function labFloorSvg(perforated: boolean): string {
  const width = 256
  const height = 256
  let body = `<rect width="${width}" height="${height}" fill="#a9b0b8"/>`
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = i * 128
      const y = j * 128
      const holes = perforated && (i + j) % 2 === 0
      body += `<rect x="${x + 2}" y="${y + 2}" width="124" height="124" rx="2" fill="${(i + j) % 2 ? "#d3d7dc" : "#cdd2d7"}"/>`
      body += `<rect x="${x + 2}" y="${y + 2}" width="124" height="2" fill="#e0e3e7" opacity="0.7"/><rect x="${x + 2}" y="${y + 2}" width="2" height="124" fill="#e0e3e7" opacity="0.7"/>`
      if (holes) {
        for (let column = 0; column < 9; column++) {
          for (let row = 0; row < 9; row++) {
            body += `<circle cx="${x + 16 + column * 12}" cy="${y + 16 + row * 12}" r="2.6" fill="#9ca3ac"/>`
          }
        }
      }
      for (const [screwX, screwY] of PANEL_SCREWS) {
        body += `<circle cx="${x + screwX}" cy="${y + screwY}" r="1.6" fill="#b3b9c1"/>`
      }
    }
  }
  return svgDocument(width, height, body)
}
