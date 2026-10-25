import type { Animation, TypedArray } from "@gltf-transform/core"
import { mat4, quat } from "gl-matrix"
import { boneRest, type RestPose } from "../document/rest-pose.ts"
import { requirePresent } from "../require-present.ts"
import type { RigBone } from "../rig-joints.ts"

interface ChannelTrack {
  times: TypedArray
  values: TypedArray
  components: number
  step: boolean
}

/** A bone's world matrix at a time in the clip. */
export type BoneWorldMatrix = (bone: RigBone, time: number) => mat4

/** Samples a track at `time`: clamped at the ends, slerp for rotations, linear otherwise. */
function sampleTrack(track: ChannelTrack, time: number): number[] {
  const { times, values, components } = track
  const last = times.length - 1
  const keyAt = (key: number): number[] =>
    Array.from(values.subarray(key * components, key * components + components))
  if (time <= times[0]) return keyAt(0)
  if (time >= times[last]) return keyAt(last)
  let below = 0
  let above = last
  while (above - below > 1) {
    const middle = (below + above) >> 1
    if (times[middle] <= time) below = middle
    else above = middle
  }
  if (track.step) return keyAt(below)
  const fraction = (time - times[below]) / (times[above] - times[below])
  const from = keyAt(below)
  const to = keyAt(above)
  return components === 4
    ? Array.from(quat.slerp(quat.create(), from, to, fraction))
    : from.map((value, component) => value + (to[component] - value) * fraction)
}

/**
 * Forward kinematics over a clip: returns a function giving any rig bone's world matrix at any
 * time, from the clip's channels (rest pose where a channel is missing) up the bone chain.
 */
export function forwardKinematics(animation: Animation, restPose: RestPose): BoneWorldMatrix {
  const tracks = new Map<string, Map<string, ChannelTrack>>()
  for (const channel of animation.listChannels()) {
    const sampler = requirePresent(channel.getSampler(), "channel sampler")
    const path = requirePresent(channel.getTargetPath(), "channel path")
    const nodeName = requirePresent(channel.getTargetNode(), "channel target").getName()
    let byPath = tracks.get(nodeName)
    if (!byPath) {
      byPath = new Map()
      tracks.set(nodeName, byPath)
    }
    byPath.set(path, {
      times: requirePresent(requirePresent(sampler.getInput(), "input").getArray(), "input data"),
      values: requirePresent(
        requirePresent(sampler.getOutput(), "output").getArray(),
        "output data",
      ),
      components: path === "rotation" ? 4 : 3,
      step: sampler.getInterpolation() === "STEP",
    })
  }
  const localMatrix = (bone: RigBone, time: number) => {
    const boneTracks = tracks.get(bone)
    const rest = boneRest(restPose, bone)
    const rotation = boneTracks?.get("rotation")
    const translation = boneTracks?.get("translation")
    const scale = boneTracks?.get("scale")
    return mat4.fromRotationTranslationScale(
      mat4.create(),
      rotation ? sampleTrack(rotation, time) : rest.rotation,
      translation ? sampleTrack(translation, time) : rest.translation,
      scale ? sampleTrack(scale, time) : rest.scale,
    )
  }
  return (bone, time) => {
    let matrix = localMatrix(bone, time)
    let parent = boneRest(restPose, bone).parent
    while (parent) {
      matrix = mat4.multiply(mat4.create(), localMatrix(parent, time), matrix)
      parent = boneRest(restPose, parent).parent
    }
    return matrix
  }
}
