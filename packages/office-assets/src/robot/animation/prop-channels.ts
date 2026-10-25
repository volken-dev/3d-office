import type { Animation, Node } from "@gltf-transform/core"
import { quat } from "gl-matrix"
import { addVectors, type Vector3 } from "../vector3.ts"
import { addChannel, type ClipAuthoring, keyTimes } from "./clip-channels.ts"

/** A clip-only prop's state at one moment: uniform scale, translation offset, z roll in degrees. */
export interface PropKey {
  scale: number
  offset?: Vector3
  roll?: number
}

/**
 * Keys a clip-only prop joint over `duration` seconds: scale, translation (its rest position plus
 * `offset`) and a roll about z.
 */
export function addPropChannels(
  authoring: ClipAuthoring,
  animation: Animation,
  node: Node,
  duration: number,
  keyAt: (u: number) => PropKey,
): void {
  const times = keyTimes(duration)
  const restTranslation = node.getTranslation()
  const keys = times.map((time) => keyAt(time / duration))
  addChannel(
    authoring,
    animation,
    node,
    "scale",
    times,
    keys.map((key) => [key.scale, key.scale, key.scale]),
  )
  addChannel(
    authoring,
    animation,
    node,
    "translation",
    times,
    keys.map((key) => addVectors(restTranslation, key.offset ?? [0, 0, 0])),
  )
  addChannel(
    authoring,
    animation,
    node,
    "rotation",
    times,
    keys.map((key) => Array.from(quat.fromEuler(quat.create(), 0, 0, key.roll || 0))),
  )
}
