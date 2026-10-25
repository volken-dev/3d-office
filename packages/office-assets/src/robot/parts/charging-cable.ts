import { CABLE_ANCHOR } from "../prop-anchors.ts"
import type { BodyBuilder } from "./body-builder.ts"

/**
 * The charging cable: a socket ring on the battery, a cable curving down and back, and a plug.
 * Bound to the `cable` joint on the spine, which rests at scale 0 (hidden); only the charging
 * clips show it.
 */
export function emitChargingCable(body: BodyBuilder): void {
  const cable = body.rigid("cable")
  const x = CABLE_ANCHOR[0]
  body.emit(
    "accent",
    body.superEllipsoid([x, 0.45, -0.199], [0.032, 0.032, 0.006], 0.6, 6, 16),
    cable,
  )
  body.emit(
    "secondary",
    body.tube(
      body.densify(
        [
          [x, 0.45, -0.205],
          [x, 0.39, -0.28],
          [x, 0.34, -0.38],
          [x, 0.34, -0.47],
          [x, 0.38, -0.53],
        ],
        0.015,
      ),
      0.011,
      8,
    ),
    cable,
  )
  body.emit(
    "secondary",
    body.superEllipsoid([x, 0.395, -0.555], [0.03, 0.03, 0.035], 0.4, 6, 12),
    cable,
  )
  body.emit(
    "accent",
    body.superEllipsoid([x, 0.395, -0.588], [0.022, 0.022, 0.004], 0.6, 4, 12),
    cable,
  )
}
