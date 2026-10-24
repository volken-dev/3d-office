import type { Document, GLTF, Node } from "@gltf-transform/core"
import type { AccessorFactory } from "../document/accessor-factory.ts"
import { HOVER_HEIGHT } from "./minibot-design.ts"

/** The body's offset and attitude at a moment of a clip. Everything defaults to rest. */
interface MinibotKey {
  x?: number
  y?: number
  z?: number
  /** Degrees about X; + tips the top forward. */
  pitch?: number
  /** Degrees about Z. */
  roll?: number
  /** Uniform scale. */
  scale?: number
}

const DEGREES = Math.PI / 180

/**
 * Pitch (about X) then roll (about Z) as a quaternion. Yaw is the product's job, on node
 * `minibot`.
 */
function pitchRollQuaternion(pitch: number, roll: number): number[] {
  const [cosPitch, sinPitch, cosRoll, sinRoll] = [
    Math.cos(pitch / 2),
    Math.sin(pitch / 2),
    Math.cos(roll / 2),
    Math.sin(roll / 2),
  ]
  return [sinPitch * cosRoll, -sinPitch * sinRoll, cosPitch * sinRoll, cosPitch * cosRoll]
}

/** A sine over normalised time with whole periods per loop, so loops are seamless. */
function sineWave(u: number, cycles = 1, phase = 0): number {
  return Math.sin(2 * Math.PI * (cycles * u + phase))
}

/** Ease-out with overshoot. */
function easeOutBack(u: number, overshoot = 1.7): number {
  return 1 + (overshoot + 1) * (u - 1) ** 3 + overshoot * (u - 1) ** 2
}

/**
 * Adds the minibot's clips. Every clip keys the body's translation, rotation and scale. Hover,
 * Fly and Work loop (Work leans in, nodding at the work); Pop_In and Pop_Out are one-shots for
 * spawning and dismissing.
 */
export function addMinibotClips(
  document: Document,
  createAccessor: AccessorFactory,
  body: Node,
): void {
  const addClip = (
    name: string,
    duration: number,
    intervals: number,
    keyAt: (u: number) => MinibotKey,
  ) => {
    const animation = document.createAnimation(name)
    const times = Array.from(
      { length: intervals + 1 },
      (_, index) => (duration * index) / intervals,
    )
    const keys = times.map((time) => keyAt(time / duration))
    const tracks: [
      GLTF.AnimationChannelTargetPath,
      GLTF.AccessorType,
      (key: MinibotKey) => number[],
    ][] = [
      ["translation", "VEC3", (key) => [key.x || 0, HOVER_HEIGHT + (key.y || 0), key.z || 0]],
      [
        "rotation",
        "VEC4",
        (key) => pitchRollQuaternion((key.pitch || 0) * DEGREES, (key.roll || 0) * DEGREES),
      ],
      ["scale", "VEC3", (key) => [key.scale ?? 1, key.scale ?? 1, key.scale ?? 1]],
    ]
    for (const [path, type, valuesOf] of tracks) {
      const sampler = document
        .createAnimationSampler()
        .setInput(createAccessor("SCALAR", new Float32Array(times)))
        .setOutput(createAccessor(type, new Float32Array(keys.flatMap(valuesOf))))
        .setInterpolation("LINEAR")
      animation
        .addSampler(sampler)
        .addChannel(
          document
            .createAnimationChannel()
            .setTargetNode(body)
            .setTargetPath(path)
            .setSampler(sampler),
        )
    }
  }
  addClip("Hover", 2.4, 24, (u) => ({
    y: 0.025 * sineWave(u),
    roll: 3 * sineWave(u, 1, 0.2),
    pitch: 2 * sineWave(u, 2),
  }))
  addClip("Fly", 1.2, 12, (u) => ({
    y: 0.012 * sineWave(u, 2),
    pitch: 14 + 2 * sineWave(u, 2, 0.25),
    roll: 2 * sineWave(u),
  }))
  addClip("Work", 1.6, 16, (u) => ({
    y: -0.03 + 0.01 * sineWave(u),
    x: 0.012 * sineWave(u, 1, 0.25),
    pitch: 16 + 5 * Math.max(0, sineWave(u, 2)),
    roll: 2 * sineWave(u, 1, 0.5),
  }))
  addClip("Pop_In", 0.5, 15, (u) => ({
    scale: Math.max(0, easeOutBack(u)),
    y: -0.15 * (1 - u) ** 2,
  }))
  addClip("Pop_Out", 0.35, 10, (u) => ({
    scale: Math.max(0, 1 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 2.2)) - u ** 2),
    y: 0.05 * u,
  }))
}
