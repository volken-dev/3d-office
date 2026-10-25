import type { Accessor, Animation, Document, Node } from "@gltf-transform/core"
import type { OfficeBuildContext } from "./office-build-context.ts"
import { type Quaternion, type Vector3, yawQuaternion } from "./vector-math.ts"

/** The loop length in seconds; play the clip on repeat. */
const LOOP_SECONDS = 2.4

/** Keys per loop (plus the closing key at the loop's end). */
const KEY_INTERVALS = 24

/** How many coolant vapour puffs there are (`anim-steam-1` to `-3`), a third of a loop apart. */
const STEAM_PUFFS = 3

type CreateAccessor = (type: "SCALAR" | "VEC3" | "VEC4", array: Float32Array) => Accessor

/**
 * Adds clip `Ambient`, one seamless loop with nothing blinking: coolant vapour rising off the
 * maintenance bar (each puff rises and swells, and is at scale 0 at the wrap), rack shuttles sliding
 * back and forth, factory arms swinging out and back (a sine), and the sliding rows (conveyor
 * robots, data-link capsules) moving exactly one spacing per loop so the last key lands on the next
 * item's start.
 */
export function addAmbientClip(
  document: Document,
  context: OfficeBuildContext,
  nodesByName: Map<string, Node>,
  createAccessor: CreateAccessor,
): void {
  const animation: Animation = document.createAnimation("Ambient")
  const channel = (
    node: Node,
    path: "translation" | "rotation" | "scale",
    times: number[],
    values: (Vector3 | Quaternion | number[])[],
  ): void => {
    const sampler = document
      .createAnimationSampler()
      .setInput(createAccessor("SCALAR", new Float32Array(times)))
      .setOutput(
        createAccessor(path === "rotation" ? "VEC4" : "VEC3", new Float32Array(values.flat())),
      )
      .setInterpolation("LINEAR")
    animation
      .addSampler(sampler)
      .addChannel(
        document
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath(path)
          .setSampler(sampler),
      )
  }
  const requireNode = (name: string): Node => {
    const node = nodesByName.get(name)
    if (node === undefined) throw new Error(`clip Ambient animates ${name}, which has no geometry`)
    return node
  }
  const times = Array.from(
    { length: KEY_INTERVALS + 1 },
    (_, index) => (index * LOOP_SECONDS) / KEY_INTERVALS,
  )
  for (let k = 1; k <= STEAM_PUFFS; k++) {
    const node = nodesByName.get(`anim-steam-${k}`)
    const base = context.animationPivots.get(`anim-steam-${k}`)
    if (node === undefined || base === undefined) continue
    const phase = (u: number): number => (u + (k - 1) / 3) % 1
    channel(
      node,
      "translation",
      times,
      times.map((time): Vector3 => {
        const u = phase(time / LOOP_SECONDS)
        return [
          base[0] + 0.015 * Math.sin(2 * Math.PI * (u + k / 3)),
          base[1] + 0.02 + 0.24 * u,
          base[2],
        ]
      }),
    )
    channel(
      node,
      "scale",
      times,
      times.map((time): Vector3 => {
        const u = phase(time / LOOP_SECONDS)
        const scale = Math.sin(Math.PI * u) * (0.8 + 0.6 * u)
        return [scale, scale, scale]
      }),
    )
  }
  for (const shuttle of context.shuttleSlides) {
    channel(
      requireNode(shuttle.node),
      "translation",
      times,
      times.map((time) => {
        const offset =
          shuttle.amplitude * Math.sin(2 * Math.PI * (time / LOOP_SECONDS + shuttle.phase))
        return [0, 1, 2].map((axis) => shuttle.from[axis] + shuttle.direction[axis] * offset)
      }),
    )
  }
  for (const arm of context.armSwings) {
    channel(
      requireNode(arm.node),
      "rotation",
      times,
      times.map((time) =>
        yawQuaternion(arm.amplitude * Math.sin(2 * Math.PI * (time / LOOP_SECONDS + arm.phase))),
      ),
    )
  }
  for (const row of context.slidingRows) {
    channel(
      requireNode(row.node),
      "translation",
      times,
      times.map((time) =>
        [0, 1, 2].map(
          (axis) => row.from[axis] + ((row.to[axis] - row.from[axis]) * time) / LOOP_SECONDS,
        ),
      ),
    )
  }
}
