import type { Animation } from "@gltf-transform/core"
import { requirePresent } from "../require-present.ts"
import { addChannel, type ClipAuthoring, clipDuration, requireAnimation } from "./clip-channels.ts"

/**
 * A time-reversed copy of every channel clip `sourceName` has so far, for one-shot transitions
 * played backwards (Stand is Sit reversed, Plug_Out is Plug_In reversed).
 */
export function reverseClip(authoring: ClipAuthoring, name: string, sourceName: string): Animation {
  const source = requireAnimation(authoring.document, sourceName)
  const duration = clipDuration(source)
  const animation = authoring.document.createAnimation(name)
  for (const channel of source.listChannels()) {
    const sampler = requirePresent(channel.getSampler(), "channel sampler")
    const input = requirePresent(
      requirePresent(sampler.getInput(), "input").getArray(),
      "input data",
    )
    const output = requirePresent(
      requirePresent(sampler.getOutput(), "output").getArray(),
      "output data",
    )
    const components = output.length / input.length
    const inputTimes: number[] = Array.from(input)
    const times = inputTimes.reverse().map((time) => duration - time)
    const values: number[][] = []
    for (let key = input.length - 1; key >= 0; key--) {
      values.push(Array.from(output.subarray(key * components, key * components + components)))
    }
    addChannel(
      authoring,
      animation,
      requirePresent(channel.getTargetNode(), "channel target"),
      requirePresent(channel.getTargetPath(), "channel path"),
      times,
      values,
      sampler.getInterpolation(),
    )
  }
  return animation
}
