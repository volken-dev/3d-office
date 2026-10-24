import type { Animation, Document, GLTF, Node } from "@gltf-transform/core"
import type { AccessorFactory } from "../document/accessor-factory.ts"
import { requirePresent } from "../require-present.ts"

/** What writing animation channels needs: the document and its accessor factory. */
export interface ClipAuthoring {
  document: Document
  createAccessor: AccessorFactory
}

/** Degrees to radians. */
export const DEGREES = Math.PI / 180

/**
 * Adds a sampler and channel to `animation` animating `path` of `node`. `values` holds one key
 * per time: four components for rotation, one per morph target for weights, three otherwise.
 */
export function addChannel(
  authoring: ClipAuthoring,
  animation: Animation,
  node: Node,
  path: GLTF.AnimationChannelTargetPath,
  times: readonly number[],
  values: readonly (readonly number[])[],
  interpolation: GLTF.AnimationSamplerInterpolation = "LINEAR",
): void {
  const flatValues = new Float32Array(values.flat())
  const type = path === "rotation" ? "VEC4" : path === "weights" ? "SCALAR" : "VEC3"
  const sampler = authoring.document
    .createAnimationSampler()
    .setInput(authoring.createAccessor("SCALAR", new Float32Array(times)))
    .setOutput(authoring.createAccessor(type, flatValues))
    .setInterpolation(interpolation)
  animation
    .addSampler(sampler)
    .addChannel(
      authoring.document
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(path)
        .setSampler(sampler),
    )
}

/** Key times over a clip of `duration` seconds: about 30 per second, at least 12 intervals. */
export function keyTimes(duration: number): number[] {
  const intervals = Math.max(12, Math.round(duration * 30))
  return Array.from({ length: intervals + 1 }, (_, index) => (index * duration) / intervals)
}

/** A clip's length: the latest key time over all its channels. */
export function clipDuration(animation: Animation): number {
  return Math.max(
    ...animation
      .listChannels()
      .map(
        (channel) =>
          requirePresent(
            requirePresent(channel.getSampler(), "channel sampler").getInput(),
            "sampler input",
          ).getMax([0])[0],
      ),
  )
}

/** The animation named `name`; throws if the document has none. */
export function requireAnimation(document: Document, name: string): Animation {
  return requirePresent(
    document
      .getRoot()
      .listAnimations()
      .find((animation) => animation.getName() === name),
    `clip ${name}`,
  )
}
