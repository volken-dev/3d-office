import type { Animation, AnimationSampler } from "@gltf-transform/core"
import { quat } from "gl-matrix"
import { boneRest, type RestPose } from "../document/rest-pose.ts"
import { requirePresent } from "../require-present.ts"
import { RIG_BONES } from "../rig-joints.ts"
import { addVectors } from "../vector3.ts"
import type { EulerDegrees, PoseFunction } from "./bone-pose.ts"
import { addChannel, type ClipAuthoring, keyTimes, requireAnimation } from "./clip-channels.ts"

/** What building a clip needs: channel authoring and the rig's rest pose. */
export interface ClipContext extends ClipAuthoring {
  restPose: RestPose
}

/**
 * `baseRotation` turned by `euler`, where the Euler angles are taken in the bone's bind-pose
 * world axes rather than its local axes, so "x" means the same direction on every bone.
 */
function rotateInBindAxes(
  bindRotation: quat,
  baseRotation: readonly number[],
  euler: EulerDegrees,
): number[] {
  const delta = quat.fromEuler(quat.create(), euler[0], euler[1], euler[2])
  const rotation = quat.multiply(quat.create(), quat.invert(quat.create(), bindRotation), delta)
  quat.multiply(rotation, rotation, bindRotation)
  return Array.from(quat.normalize(rotation, quat.multiply(rotation, baseRotation, rotation)))
}

/** The first key of a sampler's output: a clip's opening pose for one channel. */
function firstKey(sampler: AnimationSampler, components: number): number[] {
  const output = requirePresent(
    requirePresent(sampler.getOutput(), "sampler output").getArray(),
    "sampler output data",
  )
  return Array.from(output.subarray(0, components))
}

/**
 * Keys every rig bone over `duration` seconds from a base pose plus `pose`'s deltas: rotation,
 * translation (the root moved by `rootOffset`) and the rest scale.
 */
function keyBones(
  context: ClipContext,
  animation: Animation,
  duration: number,
  pose: PoseFunction,
  baseFor: (bone: (typeof RIG_BONES)[number]) => { rotation: number[]; translation: number[] },
): void {
  const times = keyTimes(duration)
  const poses = times.map((time) => pose(time / duration))
  for (const bone of RIG_BONES) {
    const rest = boneRest(context.restPose, bone)
    const base = baseFor(bone)
    addChannel(
      context,
      animation,
      rest.node,
      "rotation",
      times,
      poses.map((keyPose) =>
        rotateInBindAxes(rest.bindRotation, base.rotation, keyPose[bone] ?? [0, 0, 0]),
      ),
    )
    addChannel(
      context,
      animation,
      rest.node,
      "translation",
      times,
      poses.map((keyPose) => {
        const rootOffset = keyPose.rootOffset
        if (bone === "root" && rootOffset) {
          return addVectors(
            [base.translation[0], base.translation[1], base.translation[2]],
            rootOffset,
          )
        }
        return base.translation
      }),
    )
    addChannel(
      context,
      animation,
      rest.node,
      "scale",
      times,
      poses.map(() => rest.scale),
    )
  }
}

/**
 * A new full-body clip keyed on top of the rest pose. Used for the clips with no source pose
 * (Dance, Jump, Celebrate).
 */
export function makeClip(
  context: ClipContext,
  name: string,
  duration: number,
  pose: PoseFunction,
): Animation {
  const animation = context.document.createAnimation(name)
  keyBones(context, animation, duration, pose, (bone) => {
    const rest = boneRest(context.restPose, bone)
    return { rotation: rest.rotation, translation: rest.translation }
  })
  return animation
}

/**
 * A new clip derived from an existing pose: each bone's base is the first key of the source
 * clip `sourceName` (the rest pose where the source does not animate it), plus `pose`'s deltas.
 * This keeps derived clips at the source's height and stance (seated clips stay seated).
 */
export function deriveClip(
  context: ClipContext,
  name: string,
  sourceName: string,
  duration: number,
  pose: PoseFunction,
): Animation {
  const source = requireAnimation(context.document, sourceName)
  const sourceSamplers = new Map<string, Map<string, AnimationSampler>>()
  for (const channel of source.listChannels()) {
    const nodeName = requirePresent(channel.getTargetNode(), "channel target").getName()
    let byPath = sourceSamplers.get(nodeName)
    if (!byPath) {
      byPath = new Map()
      sourceSamplers.set(nodeName, byPath)
    }
    byPath.set(
      requirePresent(channel.getTargetPath(), "channel path"),
      requirePresent(channel.getSampler(), "channel sampler"),
    )
  }
  const animation = context.document.createAnimation(name)
  keyBones(context, animation, duration, pose, (bone) => {
    const rest = boneRest(context.restPose, bone)
    const samplers = sourceSamplers.get(bone)
    const rotationSampler = samplers?.get("rotation")
    const translationSampler = samplers?.get("translation")
    return {
      rotation: rotationSampler ? firstKey(rotationSampler, 4) : rest.rotation,
      translation: translationSampler ? firstKey(translationSampler, 3) : rest.translation,
    }
  })
  return animation
}
