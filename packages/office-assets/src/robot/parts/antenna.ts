import { heightBlendWeights } from "../geometry/skin-weights.ts"
import { smoothstep } from "../scalar-easing.ts"
import type { BodyBuilder } from "./body-builder.ts"

/**
 * The antenna: a metal collar on the head, a mast that bends from the `antenna` joint into the
 * `antenna_tip` joint, and a glowing ball. The two joints are driven by a spring simulation of the
 * head's motion, generated per clip.
 */
export function emitAntenna(body: BodyBuilder): void {
  body.emit(
    "metal",
    body.superEllipsoid([0.1, 1.235, -0.04], [0.036, 0.02, 0.036], 0.5, 8, 16),
    body.rigid("head"),
  )
  body.emit(
    "secondary",
    body.superEllipsoid([0.1, 1.258, -0.04], [0.022, 0.008, 0.022], 0.5, 6, 14),
    body.rigid("antenna"),
  )
  body.emit(
    "secondary",
    body.tube(
      body.densify(
        [
          [0.1, 1.25, -0.04],
          [0.1, 1.435, -0.04],
        ],
        0.015,
      ),
      0.0105,
      8,
    ),
    heightBlendWeights(body.joint("antenna"), body.joint("antenna_tip"), (height) =>
      smoothstep(1.31, 1.37, height),
    ),
  )
  body.emit(
    "metal",
    body.superEllipsoid([0.1, 1.432, -0.04], [0.02, 0.01, 0.02], 0.5, 6, 12),
    body.rigid("antenna_tip"),
  )
  body.emit(
    "accent",
    body.ellipsoid([0.1, 1.465, -0.04], [0.036, 0.036, 0.036], 10, 18),
    body.rigid("antenna_tip"),
  )
}
