/**
 * A point on the office floor, in metres. The office is laid out on the x/z plane (y is up), so
 * movement code only ever needs these two coordinates.
 */
export type FloorPoint = readonly [x: number, z: number]

/** A cell of the walk grid, addressed by column (along x) and row (along z). */
export type GridCell = readonly [column: number, row: number]
