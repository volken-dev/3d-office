import { heightBlendWeights } from "../geometry/skin-weights.ts"
import { smoothstep } from "../scalar-easing.ts"
import type { Vector3 } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/** The neck: a metal collar and a trim ring, blending from the spine into the head. */
export function emitNeck(body: BodyBuilder): void {
  const neckWeights = heightBlendWeights(body.joint("spine"), body.joint("head"), (height) =>
    smoothstep(0.58, 0.63, height),
  )
  body.emit(
    "metal",
    body.superEllipsoid([0.003, 0.605, 0], [0.068, 0.035, 0.068], 0.5, 8, 18),
    neckWeights,
  )
  if (!body.lite) {
    const ring = Array.from({ length: 24 }, (_, index): Vector3 => {
      const angle = (2 * Math.PI * index) / 24
      return [0.003 + 0.07 * Math.cos(angle), 0.6, 0.07 * Math.sin(angle)]
    })
    body.emit(
      "secondary",
      body.tube(ring, 0.008, 8, { closed: true, center: [0.003, 0.6, 0] }),
      neckWeights,
    )
  }
}
