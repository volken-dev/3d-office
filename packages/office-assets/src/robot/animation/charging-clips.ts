import { quat } from "gl-matrix"
import type { PropJointNodes } from "../document/prop-joints.ts"
import { RIG_BONES } from "../rig-joints.ts"
import { smoothstep } from "../scalar-easing.ts"
import { addVectors } from "../vector3.ts"
import type { BonePose } from "./bone-pose.ts"
import { addChannel, keyTimes } from "./clip-channels.ts"
import { type ClipContext, deriveClip } from "./keyed-clips.ts"
import { sineWave } from "./pose-waves.ts"
import { reverseClip } from "./reversed-clip.ts"

/** Seated and asleep on the charger: leaning forward, head drooped, breathing slowly. */
function chargePose(u: number): BonePose {
  return {
    spine: [12 + 2.5 * sineWave(u), 0, 0],
    head: [17 + 3 * sineWave(u, 1, -0.6), 0, 8],
    "arm.L": [0, 0, -10],
    "arm.R": [0, 0, 10],
  }
}

/** Every rotation delta of `pose` multiplied by `factor` (blending in from no delta). */
function scalePose(pose: BonePose, factor: number): BonePose {
  const scaled: BonePose = {}
  for (const bone of RIG_BONES) {
    const rotation = pose[bone]
    if (rotation) scaled[bone] = [rotation[0] * factor, rotation[1] * factor, rotation[2] * factor]
  }
  return scaled
}

/**
 * Charge (a loop derived from Sit_Idle, cable shown, Zzz bobbing), Plug_In (Sit_Idle easing into
 * Charge's first frame while the cable grows out of the back to the socket and the Zzz fade in at
 * the end, so Charge picks up seamlessly) and Plug_Out (Plug_In backwards).
 */
export function addChargingClips(context: ClipContext, props: PropJointNodes): void {
  addChargeClip(context, props)
  addPlugClips(context, props)
}

function addChargeClip(context: ClipContext, props: PropJointNodes): void {
  const duration = 3.0
  const charge = deriveClip(context, "Charge", "Sit_Idle", duration, chargePose)
  const times = keyTimes(duration)
  const restTranslation = props.sleepLetters.getTranslation()
  addChannel(
    context,
    charge,
    props.cable,
    "scale",
    times,
    times.map(() => [1, 1, 1]),
  )
  addChannel(
    context,
    charge,
    props.sleepLetters,
    "scale",
    times,
    times.map((time) => {
      const size = 0.9 + 0.1 * Math.sin((2 * Math.PI * time) / duration)
      return [size, size, size]
    }),
  )
  addChannel(
    context,
    charge,
    props.sleepLetters,
    "translation",
    times,
    times.map((time) =>
      addVectors(restTranslation, [
        0.015 * Math.sin((2 * Math.PI * time) / duration),
        0.025 + 0.025 * Math.sin((4 * Math.PI * time) / duration),
        0,
      ]),
    ),
  )
  addChannel(
    context,
    charge,
    props.sleepLetters,
    "rotation",
    times,
    times.map((time) =>
      Array.from(
        quat.fromEuler(quat.create(), 0, 0, 8 * Math.sin((2 * Math.PI * time) / duration)),
      ),
    ),
  )
}

function addPlugClips(context: ClipContext, props: PropJointNodes): void {
  const duration = 1.0
  const chargeStart = chargePose(0)
  const plugIn = deriveClip(context, "Plug_In", "Sit_Idle", duration, (u) =>
    scalePose(chargeStart, smoothstep(0, 1, u)),
  )
  const times = keyTimes(duration)
  const restTranslation = props.sleepLetters.getTranslation()
  addChannel(
    context,
    plugIn,
    props.cable,
    "scale",
    times,
    times.map((time) => {
      const size = smoothstep(0.2, 0.7, time / duration)
      return [size, size, size]
    }),
  )
  addChannel(
    context,
    plugIn,
    props.sleepLetters,
    "scale",
    times,
    times.map((time) => {
      const size = 0.9 * smoothstep(0.75, 1, time / duration)
      return [size, size, size]
    }),
  )
  addChannel(
    context,
    plugIn,
    props.sleepLetters,
    "translation",
    times,
    times.map(() => addVectors(restTranslation, [0, 0.025, 0])),
  )
  addChannel(
    context,
    plugIn,
    props.sleepLetters,
    "rotation",
    times,
    times.map(() => [0, 0, 0, 1]),
  )
  reverseClip(context, "Plug_Out", "Plug_In")
}
