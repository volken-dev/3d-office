import { roundedRectanglePath } from "../geometry/rounded-rectangle.ts"
import type { ReadonlyVector3 } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/** The head shell's centre. */
const HEAD_CENTER: ReadonlyVector3 = [0, 0.915, -0.02]

/**
 * The head shell's half extents. The head is wider than the arms can reach: arms raised above
 * about horizontal disappear into it, which is why the clips keep arms out or low.
 */
const HEAD_HALF_EXTENTS: ReadonlyVector3 = [0.345, 0.31, 0.31]

/** The head shell's super-ellipsoid exponent (a soft box). */
const HEAD_EXPONENT = 0.22

/** The z of the head shell's front surface at (x, y), to seat the face screws on it. */
function headFrontZ(x: number, y: number): number {
  const inside =
    1 -
    Math.abs(x / HEAD_HALF_EXTENTS[0]) ** (2 / HEAD_EXPONENT) -
    Math.abs((y - HEAD_CENTER[1]) / HEAD_HALF_EXTENTS[1]) ** (2 / HEAD_EXPONENT)
  return HEAD_CENTER[2] + HEAD_HALF_EXTENTS[2] * Math.max(inside, 1e-4) ** (HEAD_EXPONENT / 2)
}

/**
 * The head: shell, chin band, face glass and bezel, face screws, ear pods, top hatch, back vents
 * and the status LED, all rigid on the head joint.
 */
export function emitHeadShell(body: BodyBuilder): void {
  const head = body.rigid("head")
  body.emit(
    "primary",
    body.superEllipsoid(HEAD_CENTER, HEAD_HALF_EXTENTS, HEAD_EXPONENT, 22, 40),
    head,
  )
  body.emit(
    "secondary",
    body.superEllipsoid([0, 0.655, -0.02], [0.352, 0.018, 0.318], HEAD_EXPONENT, 6, 40),
    head,
  )
  body.emit(
    "screen",
    body.superEllipsoid([0, 0.915, 0.262], [0.262, 0.193, 0.048], 0.2, 12, 28),
    head,
  )
  body.emit(
    "secondary",
    body.tube(roundedRectanglePath(0, 0.915, 0.306, 0.27, 0.2, 0.06), 0.017, 10, {
      closed: true,
      center: [0, 0.915, 0.306],
    }),
    head,
  )
  if (!body.lite) {
    const faceScrews: [number, number][] = [
      [-0.307, 1.165],
      [0.307, 1.165],
      [-0.307, 0.7],
      [0.307, 0.7],
    ]
    for (const [x, y] of faceScrews) {
      body.emit(
        "metal",
        body.ellipsoid([x, y, headFrontZ(x, y) + 0.002], [0.014, 0.014, 0.008], 6, 12),
        head,
      )
    }
  }
  for (const side of [-1, 1]) {
    body.emit(
      "secondary",
      body.superEllipsoid([side * 0.36, 0.9, -0.02], [0.042, 0.12, 0.12], 0.45, 10, 24),
      head,
    )
    body.emit(
      "primary",
      body.superEllipsoid([side * 0.398, 0.9, -0.02], [0.01, 0.085, 0.085], 0.5, 6, 20),
      head,
    )
    body.emit(
      "accent",
      body.superEllipsoid([side * 0.41, 0.9, -0.02], [0.006, 0.055, 0.055], 0.9, 6, 20),
      head,
    )
    if (!body.lite) {
      body.emit(
        "metal",
        body.ellipsoid([side * 0.416, 0.9, -0.02], [0.006, 0.02, 0.02], 6, 12),
        head,
      )
    }
  }
  if (!body.lite) {
    body.emit(
      "secondary",
      body.superEllipsoid([-0.07, 1.228, -0.05], [0.13, 0.008, 0.15], 0.3, 6, 20),
      head,
    )
    const hatchScrews: [number, number][] = [
      [-0.18, -0.18],
      [0.04, -0.18],
      [-0.18, 0.08],
      [0.04, 0.08],
    ]
    for (const [x, z] of hatchScrews) {
      body.emit("metal", body.ellipsoid([x, 1.237, z], [0.012, 0.006, 0.012], 6, 10), head)
    }
    for (let vent = 0; vent < 3; vent++) {
      body.emit(
        "secondary",
        body.superEllipsoid([0, 1.02 - vent * 0.05, -0.328], [0.16, 0.012, 0.014], 0.4, 6, 16),
        head,
      )
    }
  }
  body.emit("accent", body.ellipsoid([0.2, 0.76, -0.33], [0.022, 0.022, 0.01], 6, 12), head)
}
