import { type ClipContext, makeClip } from "./keyed-clips.ts"
import { bump, sineWave } from "./pose-waves.ts"

/**
 * Dance, Jump and Celebrate, keyed on the rest pose. They use arms-out poses because the head is
 * wider than arm reach: arms raised above horizontal would vanish into it.
 */
export function addCelebrationClips(context: ClipContext): void {
  makeClip(context, "Dance", 1.2, (u) => {
    const beat = (1 - Math.cos(4 * Math.PI * u)) / 2
    return {
      rootOffset: [0.03 * sineWave(u), 0.03 * beat, 0],
      hips: [0, 0, 6 * sineWave(u)],
      spine: [0, 12 * sineWave(u), -8 * sineWave(u)],
      head: [-6 * beat, 0, 12 * sineWave(u, 1, 0.7)],
      "arm.L": [0, 0, 32 + 18 * sineWave(u, 2)],
      "lower.arm.L": [-25, 0, 20 + 30 * sineWave(u, 2)],
      "arm.R": [0, 0, -(32 + 18 * sineWave(u, 2, Math.PI))],
      "lower.arm.R": [-25, 0, -(20 + 30 * sineWave(u, 2, Math.PI))],
      "leg.L": [-15 * Math.max(0, sineWave(u)), 0, 0],
      "leg.R": [-15 * Math.max(0, -sineWave(u)), 0, 0],
    }
  })
  makeClip(context, "Jump", 1.5, (u) => {
    const crouch = bump(u, 0.04, 0.24, 0.3, 0.38)
    const airborne = bump(u, 0.33, 0.45, 0.72, 0.86)
    const landing = bump(u, 0.84, 0.9, 0.92, 1.0)
    const height = u > 0.36 && u < 0.86 ? 0.42 * Math.sin((Math.PI * (u - 0.36)) / 0.5) : 0
    return {
      rootOffset: [0, height, 0],
      spine: [18 * crouch + 10 * landing, 0, 0],
      head: [8 * crouch - 12 * airborne, 0, 0],
      "arm.L": [35 * crouch, 0, 48 * airborne],
      "arm.R": [35 * crouch, 0, -48 * airborne],
      "lower.arm.L": [0, 0, 35 * airborne],
      "lower.arm.R": [0, 0, -35 * airborne],
      "leg.L": [-20 * airborne, 0, 0],
      "leg.R": [-20 * airborne, 0, 0],
    }
  })
  makeClip(context, "Celebrate", 1.0, (u) => {
    const hop = (1 - Math.cos(4 * Math.PI * u)) / 2
    return {
      rootOffset: [0, 0.05 * hop, 0],
      spine: [-6 + 4 * sineWave(u, 2), 0, 0],
      head: [-10, 0, 8 * sineWave(u)],
      "arm.L": [-10, 0, 44 + 8 * sineWave(u, 2)],
      "arm.R": [-10, 0, -(44 + 8 * sineWave(u, 2, Math.PI))],
      "lower.arm.L": [0, 0, 30 + 28 * sineWave(u, 2)],
      "lower.arm.R": [0, 0, -(30 + 28 * sineWave(u, 2, Math.PI))],
      "leg.L": [-12 * Math.max(0, sineWave(u, 2)), 0, 0],
      "leg.R": [-12 * Math.max(0, -sineWave(u, 2)), 0, 0],
    }
  })
}
