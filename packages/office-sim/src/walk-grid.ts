import { decodeBase64 } from "./base64"
import type { FloorPoint, GridCell } from "./floor-point"
import type { NavGrid } from "./office-extras"

/** How far, in cells, `nearestWalkableCell` looks before giving up. */
const NEAREST_SEARCH_RADIUS = 12

/** Line-of-sight checks sample the segment this many times per cell. */
const LINE_SAMPLES_PER_CELL = 4

/**
 * The decoded office walk grid: which floor cells a robot may stand on, and the geometry to move
 * between world points and cells. Obstacles are already inflated by the robot's radius.
 */
export interface WalkGrid {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  /** Whether the cell is inside the grid and walkable. */
  isWalkableCell(column: number, row: number): boolean
  /** The cell containing a world point (may lie outside the grid). */
  cellOf(x: number, z: number): GridCell
  /** The world point at the centre of a cell. */
  cellCentre(column: number, row: number): FloorPoint
  /** Whether the world point lies on a walkable cell. */
  isWalkable(x: number, z: number): boolean
  /** Whether the straight segment between two points stays on walkable cells. */
  hasClearLine(from: FloorPoint, to: FloorPoint): boolean
  /** The walkable cell nearest to a cell (ring search), or null when none is close. */
  nearestWalkableCell(column: number, row: number): GridCell | null
}

/**
 * Decodes the bit-packed walk grid from the office scene extras. The nav should come from
 * `NavGridSchema`, which bounds its size; the bit count is checked again here so a hand-built nav
 * cannot read past the end of its bits.
 */
export function decodeWalkGrid(nav: NavGrid): WalkGrid {
  const bytes = decodeBase64(nav.bits)
  const { cols, rows, cell } = nav
  const [originX, originZ] = nav.origin
  if (bytes.length * 8 < cols * rows) {
    throw new Error(`decodeWalkGrid: ${bytes.length} bytes cannot hold ${cols} x ${rows} cells`)
  }

  function isWalkableCell(column: number, row: number): boolean {
    if (column < 0 || row < 0 || column >= cols || row >= rows) return false
    const bitIndex = row * cols + column
    return (((bytes[bitIndex >> 3] ?? 0) >> (bitIndex & 7)) & 1) === 1
  }

  function cellOf(x: number, z: number): GridCell {
    return [Math.floor((x - originX) / cell), Math.floor((z - originZ) / cell)]
  }

  function cellCentre(column: number, row: number): FloorPoint {
    return [originX + (column + 0.5) * cell, originZ + (row + 0.5) * cell]
  }

  function isWalkable(x: number, z: number): boolean {
    const [column, row] = cellOf(x, z)
    return isWalkableCell(column, row)
  }

  function hasClearLine(from: FloorPoint, to: FloorPoint): boolean {
    const [fromX, fromZ] = from
    const [toX, toZ] = to
    const length = Math.hypot(toX - fromX, toZ - fromZ)
    const samples = Math.max(1, Math.ceil(length / (cell / LINE_SAMPLES_PER_CELL)))
    for (let sample = 0; sample <= samples; sample++) {
      const fraction = sample / samples
      if (!isWalkable(fromX + (toX - fromX) * fraction, fromZ + (toZ - fromZ) * fraction)) {
        return false
      }
    }
    return true
  }

  function nearestWalkableCell(column: number, row: number): GridCell | null {
    if (isWalkableCell(column, row)) return [column, row]
    for (let ring = 1; ring < NEAREST_SEARCH_RADIUS; ring++) {
      for (let offset = -ring; offset <= ring; offset++) {
        const candidates: GridCell[] = [
          [column + offset, row - ring],
          [column + offset, row + ring],
          [column - ring, row + offset],
          [column + ring, row + offset],
        ]
        for (const [candidateColumn, candidateRow] of candidates) {
          if (isWalkableCell(candidateColumn, candidateRow)) return [candidateColumn, candidateRow]
        }
      }
    }
    return null
  }

  return {
    cols,
    rows,
    cell,
    isWalkableCell,
    cellOf,
    cellCentre,
    isWalkable,
    hasClearLine,
    nearestWalkableCell,
  }
}
