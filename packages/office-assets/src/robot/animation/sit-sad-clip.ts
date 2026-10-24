import type { PropJointNodes } from "../document/prop-joints.ts"
import { type ClipContext, deriveClip } from "./keyed-clips.ts"
import { bump, sineWave } from "./pose-waves.ts"
import { addPropChannels } from "./prop-channels.ts"

/**
 * Sit_Sad, the seated error pose: slumped over the desk, one slow sigh per loop (lift, then sink)
 * and a small head shake, with the "!" shown. Based on Sit_Work so the hips sit at desk-chair
 * height; Sit_Work already leans in, so the slump on top stays small.
 */
export function addSitSadClip(context: ClipContext, props: PropJointNodes): void {
  const duration = 3.2
  const sitSad = deriveClip(context, "Sit_Sad", "Sit_Work", duration, (u) => {
    const sigh = bump(u, 0.12, 0.32, 0.38, 0.62)
    const shake = bump(u, 0.66, 0.72, 0.86, 0.94)
    return {
      spine: [5 - 6 * sigh + sineWave(u, 2), 0, 0],
      head: [4 - 9 * sigh, 7 * Math.sin(4 * Math.PI * u) * shake, 9 * (1 - sigh)],
      "arm.L": [0, 0, -6 + 4 * sigh],
      "arm.R": [0, 0, 6 - 4 * sigh],
    }
  })
  addPropChannels(context, sitSad, props.statusAlert, duration, (u) => ({
    scale: 1 + 0.08 * sineWave(u, 2),
    offset: [0, 0.012 * sineWave(u, 1), 0],
    roll: 4 * sineWave(u, 1),
  }))
}
