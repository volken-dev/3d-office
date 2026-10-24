import { addVectors, scaleVector } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"
import type { HammerGrip } from "./hammer-grip.ts"

/**
 * The hammer, shown only by the Hammer clip: in the right fist, the handle along the thumb
 * direction and the head parallel to the forearm, so its striking face points down the swing.
 * Bound to the `hammer` joint (a child of `lower.arm.R`) that rests at scale 0.
 */
export function emitHammer(body: BodyBuilder, hammerGrip: HammerGrip): void {
  const { forearmAxis, sideAxis, thumbAxis, grip } = hammerGrip
  const hammer = body.rigid("hammer")
  const handleEnd = addVectors(grip, scaleVector(thumbAxis, 0.2))
  body.emit(
    "secondary",
    body.tube(
      body.densify(
        [
          addVectors(grip, scaleVector(thumbAxis, -0.05)),
          addVectors(grip, scaleVector(thumbAxis, 0.215)),
        ],
        0.03,
      ),
      0.015,
      8,
    ),
    hammer,
  )
  body.emit(
    "metal",
    body.orientedSuperEllipsoid(
      addVectors(handleEnd, scaleVector(forearmAxis, 0.012)),
      [0.03, 0.068, 0.03],
      0.35,
      sideAxis,
      forearmAxis,
      thumbAxis,
      6,
      14,
    ),
    hammer,
  )
  body.emit(
    "accent",
    body.orientedSuperEllipsoid(
      addVectors(handleEnd, scaleVector(forearmAxis, 0.083)),
      [0.024, 0.004, 0.024],
      0.5,
      sideAxis,
      forearmAxis,
      thumbAxis,
      4,
      10,
    ),
    hammer,
  )
}
