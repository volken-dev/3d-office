import type { HeadMotion } from "./head-motion.ts"

/** The springs' states over one pass of a clip, one value per head-motion sample. */
export interface SpringTracks {
  /** Antenna base bend about z, radians. */
  baseZ: number[]
  /** Antenna base bend about x, radians. */
  baseX: number[]
  /** Antenna tip bend about z, radians. */
  tipZ: number[]
  /** Antenna tip bend about x, radians. */
  tipX: number[]
  /** Head squash (+ stretches up), as a fraction of height. */
  squash: number[]
}

/** Stiffness of a spring with natural frequency `hertz`. */
function stiffness(hertz: number): number {
  return (2 * Math.PI * hertz) ** 2
}

/**
 * Simulates three damped springs driven by the head's motion: the antenna base (2.6 Hz, two
 * axes, pushed by the base's acceleration and the head's angular acceleration), the antenna tip
 * (4.2 Hz, driven by the base) and the head squash (3.5 Hz, driven by vertical acceleration).
 * Explicit Euler at the sample rate. Loops run six passes so the springs settle, record the last,
 * and then have the drift between end and start removed so they loop seamlessly; one-shots run
 * once from rest. `bounce` scales the response.
 */
export function simulateSprings(
  motion: HeadMotion,
  bounce: number,
  oneShot: boolean,
): SpringTracks {
  const { sampleCount, timeStep } = motion
  const baseStiffness = stiffness(2.6)
  const baseDamping = 2 * 0.14 * Math.sqrt(baseStiffness)
  const tipStiffness = stiffness(4.2)
  const tipDamping = 2 * 0.12 * Math.sqrt(tipStiffness)
  const squashStiffness = stiffness(3.5)
  const squashDamping = 2 * 0.22 * Math.sqrt(squashStiffness)
  const antennaGain = 2.4 * bounce
  const squashGain = 2.2 * bounce
  let baseZ = 0
  let baseX = 0
  let baseZVelocity = 0
  let baseXVelocity = 0
  let tipZ = 0
  let tipX = 0
  let tipZVelocity = 0
  let tipXVelocity = 0
  let squash = 0
  let squashVelocity = 0
  const tracks: SpringTracks = { baseZ: [], baseX: [], tipZ: [], tipX: [], squash: [] }
  const passes = oneShot ? 1 : 6
  for (let step = 0; step < passes * sampleCount; step++) {
    const sample = step % sampleCount
    const linear = motion.antennaAcceleration[sample]
    const angular = motion.angularAcceleration[sample]
    const baseZAcceleration =
      -baseStiffness * baseZ - baseDamping * baseZVelocity + antennaGain * linear[0] - angular[2]
    const baseXAcceleration =
      -baseStiffness * baseX - baseDamping * baseXVelocity - antennaGain * linear[2] - angular[0]
    baseZVelocity += baseZAcceleration * timeStep
    baseZ += baseZVelocity * timeStep
    baseXVelocity += baseXAcceleration * timeStep
    baseX += baseXVelocity * timeStep
    const tipZAcceleration =
      -tipStiffness * tipZ - tipDamping * tipZVelocity - baseZAcceleration * 0.6
    const tipXAcceleration =
      -tipStiffness * tipX - tipDamping * tipXVelocity - baseXAcceleration * 0.6
    tipZVelocity += tipZAcceleration * timeStep
    tipZ += tipZVelocity * timeStep
    tipXVelocity += tipXAcceleration * timeStep
    tipX += tipXVelocity * timeStep
    const squashAcceleration =
      -squashStiffness * squash -
      squashDamping * squashVelocity -
      squashGain * motion.verticalAcceleration[sample] * 0.35
    squashVelocity += squashAcceleration * timeStep
    squash += squashVelocity * timeStep
    if (step >= (passes - 1) * sampleCount) {
      tracks.baseZ.push(baseZ)
      tracks.baseX.push(baseX)
      tracks.tipZ.push(tipZ)
      tracks.tipX.push(tipX)
      tracks.squash.push(squash)
    }
  }
  if (!oneShot) {
    for (const track of [tracks.baseZ, tracks.baseX, tracks.tipZ, tracks.tipX, tracks.squash]) {
      const drift = (track[sampleCount - 1] - track[0]) * (sampleCount / (sampleCount - 1))
      for (let sample = 0; sample < sampleCount; sample++) {
        track[sample] -= (drift * sample) / sampleCount
      }
    }
  }
  return tracks
}
