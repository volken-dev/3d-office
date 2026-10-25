import { quat } from "gl-matrix"
import type { PropJointNodes } from "../document/prop-joints.ts"
import { smoothstep } from "../scalar-easing.ts"
import { addChannel, keyTimes } from "./clip-channels.ts"
import { type ClipContext, deriveClip } from "./keyed-clips.ts"
import { bump, sineWave } from "./pose-waves.ts"

/** The strike's impact: a short plateau just after the hammer comes down. */
function strike(u: number): number {
  return bump(u, 0.62, 0.66, 0.7, 0.82)
}

/** The swing: 0 = struck, 1 = wound up. A slow wind-up, then a fast strike. */
function windUp(u: number): number {
  return u < 0.6 ? smoothstep(0.04, 0.6, u) : 1 - smoothstep(0.6, 0.66, u)
}

/**
 * The hammer's angle about the grip in degrees. 66: handle level, face down on the work (bench
 * top about 0.24 m); 5: wound up, handle up.
 */
function hammerAngle(u: number): number {
  return 66 - 61 * windUp(u)
}

/**
 * The deploy line's clips, derived from Idle. Hammer: the left hand steadies the work on the
 * bench, the right arm winds up and strikes, and the hammer shows only here. The arm holds the
 * fist in front of the body and the strike itself is the hammer joint turning about the grip like
 * a wrist: its local rotation is the forearm's inverse bind rotation times a rotation about x
 * (+ = handle forward and down onto the bench), landing where the workbench anvil plate is. A
 * short, low swing, because arms raised high vanish into the head. Tinker: both hands busy at the
 * bench, small fiddly movements, head down.
 */
export function addWorkbenchClips(context: ClipContext, props: PropJointNodes): void {
  const duration = 1.0
  const hammer = deriveClip(context, "Hammer", "Idle", duration, (u) => {
    const wound = windUp(u)
    const impact = strike(u)
    return {
      rootOffset: [0, -0.01 * impact, 0],
      spine: [6 + 4 * impact - 2 * wound, -6 + 3 * wound, 0],
      head: [4 + 3 * impact, -6, 0],
      "arm.R": [-42 - 8 * wound, 0, 30],
      "lower.arm.R": [-26 - 8 * wound, 0, 0],
      "arm.L": [-30, 0, -30],
      "lower.arm.L": [-25, 0, 0],
    }
  })
  addChannel(
    context,
    hammer,
    props.hammer,
    "scale",
    keyTimes(duration),
    keyTimes(duration).map(() => [1, 1, 1]),
  )
  addChannel(
    context,
    hammer,
    props.hammer,
    "rotation",
    keyTimes(duration),
    keyTimes(duration).map((time) =>
      Array.from(
        quat.multiply(
          quat.create(),
          props.forearmInverseRotation,
          quat.fromEuler(quat.create(), hammerAngle(time / duration), 0, 0),
        ),
      ),
    ),
  )
  deriveClip(context, "Tinker", "Idle", 1.6, (u) => ({
    spine: [7 + 1.5 * sineWave(u, 2), 3 * sineWave(u), 0],
    head: [5 + 2 * sineWave(u, 3), 5 * sineWave(u, 1, 0.5), 4 * sineWave(u)],
    "arm.R": [-36 + 5 * sineWave(u, 4), 0, 30 + 4 * sineWave(u, 3)],
    "lower.arm.R": [-25 + 9 * sineWave(u, 4, 0.8), 0, 0],
    "arm.L": [-34 + 5 * sineWave(u, 3, 1.4), 0, -30 + 4 * sineWave(u, 2)],
    "lower.arm.L": [-27 + 8 * sineWave(u, 3, 2.2), 0, 0],
  }))
}
