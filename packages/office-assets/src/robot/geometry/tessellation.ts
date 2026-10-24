/**
 * How finely parts are tessellated. `lite` is the crowd LOD (robot-lite): coarser tessellation,
 * thinner tubes and fewer cap steps.
 */
export interface Tessellation {
  lite: boolean
  /** Multiplier on segment counts above the floor: 0.7 for the full robot, 0.3 for lite. */
  meshDensity: number
}

/**
 * Scales a segment count by the mesh density, never below a floor (8, or 5 for lite) so small
 * parts keep their shape. Counts already at or under the floor are kept as authored.
 */
export function scaledSegments(tessellation: Tessellation, segments: number): number {
  const floor = tessellation.lite ? 5 : 8
  return segments <= floor
    ? segments
    : Math.max(floor, Math.round(segments * tessellation.meshDensity))
}
