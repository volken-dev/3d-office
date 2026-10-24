import type { FaceTargetName } from "../parts/face.ts"
import { smoothstep } from "../scalar-easing.ts"
import { bump, sineWave } from "./pose-waves.ts"

/** Face morph weights at a moment of a clip. */
export type FaceWeights = Partial<Record<FaceTargetName, number>>

/** A clip's character: its expression and how the generated antenna and squash layers behave. */
export interface ClipCharacter {
  /** Times in seconds at which the robot blinks. */
  blinks?: readonly number[]
  /** The expression over the clip's normalised time. */
  weights?: (u: number) => FaceWeights
  /** Multiplier on the antenna's and the head squash's response to motion (default 1). */
  bounce?: number
  /** How strongly the eyes lead the head's turns (default 0.6). */
  lead?: number
  /** A constant antenna droop in degrees (sleepy or sad). */
  droop?: number
  /** An antenna droop in degrees that changes over the clip, overriding `droop`. */
  droopOverTime?: (u: number) => number
  /** Moves the mouth as if speaking. */
  talk?: boolean
}

/** A full smile with happy eyes. */
function delighted(): FaceWeights {
  return { happy: 1, mouth_smile: 1 }
}

/** Waiting for the user: wide eyes looking up, a small smile. */
function expectant(): FaceWeights {
  return { wide: 0.4, look_up: 0.55, mouth_smile: 0.35, happy: 0.1 }
}

/**
 * Per-clip character, by clip name. Clips not listed get no expression, no blinks and the default
 * responses.
 */
export const CLIP_CHARACTERS: Readonly<Record<string, ClipCharacter>> = {
  Idle: { blinks: [0.6, 1.9], weights: (u) => ({ look_up: 0.2 * bump(u, 0.4, 0.5, 0.62, 0.72) }) },
  Happy: { weights: delighted, bounce: 1.3 },
  Listen: { blinks: [1.0], weights: () => ({ wide: 0.35, look_left: 0.3 }) },
  LookAround: { blinks: [1.25], lead: 2.2 },
  Pick: { weights: () => ({ look_down: 0.8, wide: 0.25, mouth_flat: 0.6 }) },
  Sad: {
    blinks: [0.5],
    weights: () => ({ sad: 1, look_down: 0.4, mouth_frown: 1 }),
    droop: 28,
  },
  Sit: { blinks: [0.3] },
  Sit_Idle: {
    blinks: [0.8, 2.0],
    weights: (u) => ({
      look_left: 0.35 * Math.max(0, sineWave(u)),
      look_right: 0.35 * Math.max(0, -sineWave(u)),
    }),
  },
  Sit_Work: {
    blinks: [1.2],
    weights: (u) => ({
      angry: 0.35,
      look_down: 0.35,
      look_left: 0.3 * Math.max(0, sineWave(u, 2)),
      look_right: 0.3 * Math.max(0, -sineWave(u, 2)),
    }),
  },
  Talk: { blinks: [1.1], talk: true, weights: () => ({ happy: 0.15 }) },
  Walk: { bounce: 1.2 },
  Wave: { weights: delighted, bounce: 1.2 },
  Dance: { weights: delighted, bounce: 1.3 },
  Jump: {
    weights: (u) => {
      const crouch = bump(u, 0.04, 0.24, 0.3, 0.38)
      const airborne = bump(u, 0.33, 0.45, 0.72, 0.86)
      const landing = bump(u, 0.86, 0.92, 0.97, 1.0)
      return {
        angry: 0.5 * crouch,
        look_down: 0.3 * crouch,
        wide: airborne,
        mouth_open: airborne,
        happy: landing,
        mouth_smile: landing,
      }
    },
  },
  Sit_Sad: {
    blinks: [0.9, 2.6],
    weights: (u) => {
      const sigh = bump(u, 0.12, 0.32, 0.38, 0.62)
      return {
        sad: 1,
        look_down: 0.55 - 0.35 * sigh,
        mouth_frown: 1 - 0.4 * sigh,
        mouth_open: 0.4 * sigh,
      }
    },
    droop: 30,
  },
  Stand: { blinks: [0.2] },
  Plug_In: {
    weights: (u) => ({ blink: smoothstep(0.45, 1, u), mouth_open: 0.15 * smoothstep(0.7, 1, u) }),
    droopOverTime: (u) => 30 * smoothstep(0.2, 1, u),
  },
  Plug_Out: {
    weights: (u) => ({
      blink: smoothstep(0.45, 1, 1 - u),
      mouth_open: 0.15 * smoothstep(0.7, 1, 1 - u),
      wide: 0.3 * smoothstep(0.6, 1, u),
    }),
    droopOverTime: (u) => 30 * smoothstep(0.2, 1, 1 - u),
  },
  Sit_Wait: { blinks: [0.55, 1.75], weights: expectant },
  Wait: { blinks: [0.55, 1.75], weights: expectant, bounce: 1.2 },
  Charge: {
    weights: (u) => ({ blink: 1, mouth_open: 0.3 * (0.5 + 0.5 * sineWave(u)) }),
    droop: 30,
  },
  Hammer: {
    blinks: [0.66],
    weights: (u) => ({
      angry: 0.3,
      look_down: 0.65,
      mouth_flat: 0.7,
      wide: 0.3 * bump(u, 0.62, 0.66, 0.72, 0.8),
    }),
  },
  Tinker: {
    blinks: [0.9],
    weights: (u) => ({
      look_down: 0.7,
      mouth_smile: 0.25,
      look_left: 0.25 * Math.max(0, sineWave(u)),
      look_right: 0.25 * Math.max(0, -sineWave(u)),
    }),
  },
  Celebrate: {
    weights: (u) => {
      const open = smoothstep(0.25, 0.75, 0.5 + 0.5 * sineWave(u, 2))
      return { happy: 1, mouth_open: open, mouth_smile: 1 - open }
    },
    bounce: 1.4,
  },
}
