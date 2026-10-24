import type { Vector3 } from "./vector-math.ts"

/**
 * Size-based tessellation: small round parts (mugs, knobs, piping, leaves) don't need the facets of
 * a big one at overview distance. Caps a super-ellipsoid's rings and sides by its largest half
 * extent; sides stay multiples of 4, so boxy shapes keep their corners. Returns `[rings, sides]`.
 */
export function superEllipsoidTessellation(
  enabled: boolean,
  half: Vector3,
  rings: number,
  sides: number,
): [number, number] {
  if (!enabled) return [rings, sides]
  const largest = Math.max(...half)
  const [ringCap, sideCap] =
    largest < 0.03
      ? [4, 8]
      : largest < 0.06
        ? [5, 8]
        : largest < 0.12
          ? [6, 12]
          : largest < 0.25
            ? [8, 16]
            : largest < 0.5
              ? [7, 16]
              : [99, 99]
  return [Math.min(rings, ringCap), Math.min(sides, sideCap)]
}

/** Caps a tube's sides by its larger radius, like {@link superEllipsoidTessellation}. */
export function tubeTessellation(enabled: boolean, radius: number, sides: number): number {
  if (!enabled) return sides
  return Math.min(sides, radius < 0.012 ? 4 : radius < 0.03 ? 6 : radius < 0.06 ? 8 : 99)
}
