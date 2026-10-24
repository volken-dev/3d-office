import type { Animation, Node } from "@gltf-transform/core"
import { quat } from "gl-matrix"
import { FACE_TARGET_NAMES, type FaceTargetName } from "../parts/face.ts"
import { requirePresent } from "../require-present.ts"
import type { ReadonlyVector3 } from "../vector3.ts"
import { addChannel, type ClipAuthoring, DEGREES, keyTimes } from "./clip-channels.ts"
import { CLIP_CHARACTERS } from "./clip-characters.ts"
import type { BoneWorldMatrix } from "./forward-kinematics.ts"
import { sampleHeadMotion } from "./head-motion.ts"
import { sineWave } from "./pose-waves.ts"
import { simulateSprings } from "./spring-simulation.ts"

/**
 * Transitions: not looped, so their generated layers are simulated once from rest, with no loop
 * closing.
 */
const ONE_SHOT_CLIPS = new Set(["Sit", "Stand", "Plug_In", "Plug_Out"])

/** The nodes the generated layers animate. */
export interface LayerTargets {
  antenna: Node
  antennaTip: Node
  head: Node
  face: Node
  /** The antenna base's position relative to the head's origin, in bind pose. */
  antennaBaseFromHead: ReadonlyVector3
}

/** Squashes `value` smoothly into (-limit, limit), near-linear for small values. */
function softClamp(value: number, limit: number): number {
  return limit * Math.tanh(value / limit)
}

function zeroFaceWeights(): Record<FaceTargetName, number> {
  return {
    blink: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    wide: 0,
    look_left: 0,
    look_right: 0,
    look_up: 0,
    look_down: 0,
    mouth_smile: 0,
    mouth_open: 0,
    mouth_flat: 0,
    mouth_frown: 0,
  }
}

/**
 * Adds the generated layers to one clip: antenna rotation from a two-joint spring simulation
 * driven by the head's real motion (plus an idle wobble and the clip's droop), head squash and
 * stretch (replacing any head scale channel; the source clips never animated it), and the face's
 * morph weights from the clip's character (expression, blinks, eyes leading head turns, talking).
 * Loops end on their first key so they are seamless. Returns a one-line summary of the clip.
 */
export function addGeneratedLayers(
  authoring: ClipAuthoring,
  animation: Animation,
  duration: number,
  boneWorld: BoneWorldMatrix,
  targets: LayerTargets,
): string {
  const name = animation.getName()
  const character = CLIP_CHARACTERS[name] || {}
  const oneShot = ONE_SHOT_CLIPS.has(name)
  const motion = sampleHeadMotion(boneWorld, duration, targets.antennaBaseFromHead, oneShot)
  const bounce = character.bounce || 1
  const springs = simulateSprings(motion, bounce, oneShot)
  const { sampleCount, timeStep } = motion
  const times = keyTimes(duration)
  const loopSampleAt = (time: number) =>
    Math.min(sampleCount - 1, Math.round(time / timeStep)) % sampleCount
  const idleCycles = Math.max(1, Math.round(duration / 1.2))
  const antennaRotations: number[][] = []
  const tipRotations: number[][] = []
  const headScales: number[][] = []
  const faceWeights: number[][] = []
  let maxAntennaAngle = 0
  let maxSquash = 0
  for (const time of times) {
    const u = time / duration
    const sample = oneShot
      ? Math.min(sampleCount - 1, Math.round(time / timeStep))
      : loopSampleAt(time % duration)
    const droop = character.droopOverTime ? character.droopOverTime(u) : character.droop || 0
    const wobble = 2.5 * sineWave(u, idleCycles)
    const crossWobble = 1.5 * sineWave(u, idleCycles, 1.3)
    const baseZ = softClamp(springs.baseZ[sample] / DEGREES, 35) + wobble
    const baseX = softClamp(springs.baseX[sample] / DEGREES, 35) + crossWobble + droop
    const tipZ = softClamp(springs.tipZ[sample] / DEGREES, 30) + 0.6 * wobble
    const tipX = softClamp(springs.tipX[sample] / DEGREES, 30) + droop * 0.7
    maxAntennaAngle = Math.max(maxAntennaAngle, Math.abs(baseZ), Math.abs(baseX - droop))
    antennaRotations.push(Array.from(quat.fromEuler(quat.create(), baseX, 0, baseZ)))
    tipRotations.push(Array.from(quat.fromEuler(quat.create(), tipX, 0, tipZ)))
    const squash = softClamp(springs.squash[sample], 0.1)
    maxSquash = Math.max(maxSquash, Math.abs(squash))
    headScales.push([1 / Math.sqrt(1 + squash), 1 + squash, 1 / Math.sqrt(1 + squash)])
    const weights = zeroFaceWeights()
    Object.assign(weights, character.weights ? character.weights(u) : {})
    for (const blinkTime of character.blinks || []) {
      weights.blink = Math.max(weights.blink, Math.max(0, 1 - Math.abs(time - blinkTime) / 0.075))
    }
    const yaw = motion.angularVelocity[sample][1] * (character.lead || 0.6) * 0.35
    weights.look_left = Math.min(1, weights.look_left + Math.max(0, yaw))
    weights.look_right = Math.min(1, weights.look_right + Math.max(0, -yaw))
    if (character.talk) {
      const open =
        Math.max(0, sineWave(u, 6)) ** 0.6 * (0.55 + 0.45 * Math.max(0, sineWave(u, 2, 0.5)))
      weights.mouth_open = open
      weights.mouth_flat = 1 - open
    }
    faceWeights.push(FACE_TARGET_NAMES.map((target) => Math.max(0, Math.min(1, weights[target]))))
  }
  if (!oneShot) {
    for (const keys of [antennaRotations, tipRotations, headScales, faceWeights]) {
      keys[keys.length - 1] = keys[0].slice()
    }
  }
  addChannel(authoring, animation, targets.antenna, "rotation", times, antennaRotations)
  addChannel(authoring, animation, targets.antennaTip, "rotation", times, tipRotations)
  for (const channel of animation.listChannels()) {
    if (channel.getTargetNode() === targets.head && channel.getTargetPath() === "scale") {
      const sampler = requirePresent(channel.getSampler(), "channel sampler")
      channel.dispose()
      sampler.dispose()
    }
  }
  addChannel(authoring, animation, targets.head, "scale", times, headScales)
  addChannel(authoring, animation, targets.face, "weights", times, faceWeights)
  return `${name.padEnd(10)} ${duration.toFixed(2)}s${oneShot ? " one-shot" : ""}  antenna ±${maxAntennaAngle.toFixed(0)}°  squash ±${(maxSquash * 100).toFixed(1)}%`
}
