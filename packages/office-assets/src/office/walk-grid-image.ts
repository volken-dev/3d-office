import sharp from "sharp"
import type { PointOfInterest } from "./office-build-context.ts"
import { cellAt, type WalkGrid } from "./walk-grid.ts"

/** Pixels per grid cell in the debug image. */
const PIXELS_PER_CELL = 4

const REACHABLE_COLOUR = [255, 255, 255]
const CUT_OFF_COLOUR = [150, 150, 150]
const BLOCKED_COLOUR = [40, 44, 52]
const POINT_OF_INTEREST_COLOUR = [230, 40, 40]

/**
 * Writes the walk grid as a PNG for debugging reachability (`NAV_PNG`): white reachable, grey
 * walkable but cut off from the first spawn, dark blocked, with the POIs as red crosses.
 */
export async function writeWalkGridImage(
  grid: WalkGrid,
  pointsOfInterest: PointOfInterest[],
  imagePath: string,
): Promise<void> {
  const { columns, rows } = grid
  const pixels = Buffer.alloc(columns * PIXELS_PER_CELL * rows * PIXELS_PER_CELL * 3)
  const paintCell = (column: number, row: number, colour: number[]): void => {
    for (let a = 0; a < PIXELS_PER_CELL; a++) {
      for (let b = 0; b < PIXELS_PER_CELL; b++) {
        pixels.set(
          colour,
          ((row * PIXELS_PER_CELL + a) * columns * PIXELS_PER_CELL + column * PIXELS_PER_CELL + b) *
            3,
        )
      }
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      paintCell(
        i,
        j,
        grid.reachable[j][i]
          ? REACHABLE_COLOUR
          : grid.walkable[j][i]
            ? CUT_OFF_COLOUR
            : BLOCKED_COLOUR,
      )
    }
  }
  const cross = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const point of pointsOfInterest) {
    const [column, row] = cellAt(grid, point.position[0], point.position[2])
    for (const [offsetColumn, offsetRow] of cross) {
      const crossColumn = column + offsetColumn
      const crossRow = row + offsetRow
      if (crossColumn >= 0 && crossRow >= 0 && crossColumn < columns && crossRow < rows) {
        paintCell(crossColumn, crossRow, POINT_OF_INTEREST_COLOUR)
      }
    }
  }
  await sharp(pixels, {
    raw: { width: columns * PIXELS_PER_CELL, height: rows * PIXELS_PER_CELL, channels: 3 },
  })
    .png()
    .toFile(imagePath)
}
