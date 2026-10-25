import type { BodyBuilder } from "./body-builder.ts"

/**
 * The legs, each rigid on its leg joint: hip ball, thigh with a knee plate, ankle collar, and a
 * foot with its sole and a toe light.
 */
export function emitLegs(body: BodyBuilder): void {
  for (const name of ["leg.L", "leg.R"]) {
    const x = body.jointFrame(name).position[0]
    const leg = body.rigid(name)
    body.emit("metal", body.ellipsoid([x, 0.215, 0], [0.045, 0.045, 0.045], 8, 16), leg)
    body.emit("primary", body.superEllipsoid([x, 0.15, 0], [0.06, 0.068, 0.064], 0.3, 10, 20), leg)
    if (!body.lite) {
      body.emit(
        "secondary",
        body.superEllipsoid([x, 0.162, 0.062], [0.038, 0.03, 0.01], 0.4, 6, 12),
        leg,
      )
    }
    body.emit(
      "metal",
      body.superEllipsoid([x, 0.084, 0.005], [0.046, 0.016, 0.046], 0.5, 6, 16),
      leg,
    )
    body.emit(
      "primary",
      body.superEllipsoid([x, 0.046, 0.034], [0.074, 0.04, 0.108], 0.3, 10, 20),
      leg,
    )
    body.emit(
      "secondary",
      body.superEllipsoid([x, 0.012, 0.034], [0.079, 0.012, 0.113], 0.3, 6, 20),
      leg,
    )
    body.emit(
      "accent",
      body.superEllipsoid([x, 0.05, 0.142], [0.034, 0.008, 0.006], 0.6, 4, 10),
      leg,
    )
  }
}
