/** Linear interpolation from `start` to `end` by `fraction`. */
export function lerp(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction
}

/** Hermite smoothstep: 0 below `edgeStart`, 1 above `edgeEnd`, an S-curve between. */
export function smoothstep(edgeStart: number, edgeEnd: number, value: number): number {
  const fraction = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)))
  return fraction * fraction * (3 - 2 * fraction)
}
