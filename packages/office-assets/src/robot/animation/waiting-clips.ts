import type { PropJointNodes } from "../document/prop-joints.ts"
import type { BonePose } from "./bone-pose.ts"
import { type ClipContext, deriveClip } from "./keyed-clips.ts"
import { sineWave } from "./pose-waves.ts"
import { addPropChannels, type PropKey } from "./prop-channels.ts"

/** Waiting for the user: looking up expectantly with a small hopeful bounce. */
function waitPose(u: number): BonePose {
  const hop = Math.max(0, sineWave(u, 2)) ** 2
  return {
    head: [-9 - 3 * hop, 9 * sineWave(u, 1, 0.4), 10 * sineWave(u)],
    spine: [-3 - 2 * hop, 0, 0],
    "arm.L": [0, 0, -4 * hop],
    "arm.R": [0, 0, 4 * hop],
  }
}

/** The "?" bubble bobbing, pulsing and rocking. */
function bubbleBob(u: number): PropKey {
  return {
    scale: 1 + 0.07 * sineWave(u, 2),
    offset: [0, 0.02 * sineWave(u, 1), 0],
    roll: 8 * sineWave(u, 1, 1.2),
  }
}

/** Sit_Wait (seated) and Wait (standing, with a hop): waiting for the user, "?" shown. */
export function addWaitingClips(context: ClipContext, props: PropJointNodes): void {
  addPropChannels(
    context,
    deriveClip(context, "Sit_Wait", "Sit_Idle", 2.4, waitPose),
    props.statusQuestion,
    2.4,
    bubbleBob,
  )
  addPropChannels(
    context,
    deriveClip(context, "Wait", "Idle", 2.4, (u) => ({
      ...waitPose(u),
      rootOffset: [0, 0.03 * Math.max(0, sineWave(u, 2)) ** 2, 0],
    })),
    props.statusQuestion,
    2.4,
    bubbleBob,
  )
}
