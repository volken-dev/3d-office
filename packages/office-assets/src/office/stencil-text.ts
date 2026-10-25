import type { FrameBuilder } from "./frame-builder.ts"
import { glyphRows } from "./pixel-font.ts"

/** A horizontal run of lit pixels in one glyph row: first and last column. */
interface PixelRun {
  characterIndex: number
  row: number
  firstColumn: number
  lastColumn: number
}

/** Every run of adjacent lit pixels in `text`, glyph by glyph, row by row, left to right. */
function pixelRuns(text: string): PixelRun[] {
  const runs: PixelRun[] = []
  ;[...text].forEach((character, characterIndex) => {
    glyphRows(character).forEach((pixels, row) => {
      for (let column = 0; column < 5; ) {
        if (pixels[column] !== "#") {
          column++
          continue
        }
        let lastColumn = column
        while (pixels[lastColumn + 1] === "#") lastColumn++
        runs.push({ characterIndex, row, firstColumn: column, lastColumn })
        column = lastColumn + 1
      }
    })
  })
  return runs
}

/**
 * Stencilled text on the floor in the 5x7 pixel font, centred on (centerX, centerZ) and upright
 * when read from +z. One rectangle per run of pixels, with small gaps between runs: the stencil
 * look, and no shared edges.
 */
export function floorStencil(
  builder: FrameBuilder,
  material: string,
  text: string,
  centerX: number,
  centerZ: number,
  pixelSize: number,
  y: number,
): void {
  const textWidth = text.length * 6 - 1
  const gap = pixelSize * 0.12
  for (const run of pixelRuns(text)) {
    const x0 = centerX + (run.characterIndex * 6 + run.firstColumn - textWidth / 2) * pixelSize
    const z0 = centerZ + (run.row - 3.5) * pixelSize
    builder.rectangle(
      material,
      x0 + gap / 2,
      z0 + gap / 2,
      x0 + (run.lastColumn - run.firstColumn + 1) * pixelSize - gap / 2,
      z0 + pixelSize - gap / 2,
      y,
    )
  }
}

/**
 * The same stencil on a wall plane at local depth `z`, facing local +z, centred on
 * (centerX, centerY): plates, signs and labels.
 */
export function wallStencil(
  builder: FrameBuilder,
  material: string,
  text: string,
  centerX: number,
  centerY: number,
  z: number,
  pixelSize: number,
): void {
  const textWidth = text.length * 6 - 1
  const gap = pixelSize * 0.12
  for (const run of pixelRuns(text)) {
    const x0 =
      centerX + (run.characterIndex * 6 + run.firstColumn - textWidth / 2) * pixelSize + gap / 2
    const x1 =
      centerX + (run.characterIndex * 6 + run.lastColumn + 1 - textWidth / 2) * pixelSize - gap / 2
    const y1 = centerY - (run.row - 3.5) * pixelSize - gap / 2
    const y0 = y1 - pixelSize + gap
    builder.quad(
      material,
      [(x0 + x1) / 2, (y0 + y1) / 2, z],
      [(x1 - x0) / 2, 0, 0],
      [0, (y1 - y0) / 2, 0],
    )
  }
}
