import { smoothstep } from "../scalar-easing.ts"

/**
 * A sine over the clip's normalised time `u`: `cycles` whole periods per loop (so loops are
 * seamless), shifted by `phase` radians.
 */
export function sineWave(u: number, cycles = 1, phase = 0): number {
  return Math.sin(2 * Math.PI * cycles * u + phase)
}

/** A plateau: rises from `riseStart` to `riseEnd`, holds, falls from `fallStart` to `fallEnd`. */
export function bump(
  u: number,
  riseStart: number,
  riseEnd: number,
  fallStart: number,
  fallEnd: number,
): number {
  return smoothstep(riseStart, riseEnd, u) * (1 - smoothstep(fallStart, fallEnd, u))
}
