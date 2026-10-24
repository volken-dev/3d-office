import type { Document, TypedArray } from "@gltf-transform/core"

/** How far two keyframe values may drift and still count as the same clip. */
const KEY_TOLERANCE = 1e-6

type ChannelKeys = { times: TypedArray; values: TypedArray }

function channelsByTarget(document: Document): Map<string, ChannelKeys> {
  const channels = new Map<string, ChannelKeys>()
  for (const animation of document.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const sampler = channel.getSampler()
      const times = sampler?.getInput()?.getArray()
      const values = sampler?.getOutput()?.getArray()
      if (!times || !values) continue
      const key = `${animation.getName()}|${channel.getTargetNode()?.getName()}|${channel.getTargetPath()}`
      channels.set(key, { times, values })
    }
  }
  return channels
}

function sameKeys(first: TypedArray, second: TypedArray): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index++) {
    if (!(Math.abs(Number(first[index]) - Number(second[index])) < KEY_TOLERANCE)) return false
  }
  return true
}

/**
 * Throws unless two files carry the same clips key for key. robot-lite ships without clips and
 * plays the robot's (three.js binds tracks by node name), so a generator change that makes the
 * two diverge must fail the build rather than ship a LOD whose animation no longer fits.
 */
export function assertSameClips(document: Document, clipSource: Document): void {
  const ownChannels = channelsByTarget(document)
  const sourceChannels = channelsByTarget(clipSource)
  if (ownChannels.size !== sourceChannels.size) {
    throw new Error(`shared clips differ: ${ownChannels.size} vs ${sourceChannels.size} channels`)
  }
  for (const [key, own] of ownChannels) {
    const source = sourceChannels.get(key)
    if (!source || !sameKeys(own.times, source.times) || !sameKeys(own.values, source.values)) {
      throw new Error(`shared clips differ at ${key}`)
    }
  }
}
