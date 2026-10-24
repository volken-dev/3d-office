import type { BodyBuilder } from "./body-builder.ts"

/**
 * The torso on the spine (shell, chest panel with a mini display, waveform and LEDs, side vents,
 * the battery on the back with its cells and screws), then the waist and hips on the hips joint.
 */
export function emitTorso(body: BodyBuilder): void {
  const spine = body.rigid("spine")
  const hips = body.rigid("hips")
  body.emit(
    "primary",
    body.superEllipsoid([0.003, 0.445, 0], [0.16, 0.145, 0.13], 0.25, 16, 32),
    spine,
  )
  body.emit(
    "secondary",
    body.superEllipsoid([0.003, 0.47, 0.128], [0.1, 0.075, 0.009], 0.3, 6, 20),
    spine,
  )
  body.emit(
    "screen",
    body.superEllipsoid([-0.025, 0.492, 0.137], [0.05, 0.032, 0.004], 0.3, 6, 16),
    spine,
  )
  if (!body.lite) {
    const waveformHeights = [0.008, 0.017, 0.026, 0.014, 0.02, 0.007]
    waveformHeights.forEach((height, bar) => {
      body.emit(
        "eye",
        body.superEllipsoid([-0.06 + bar * 0.014, 0.492, 0.142], [0.004, height, 0.002], 0.5, 4, 8),
        spine,
      )
    })
  }
  for (let led = 0; led < 3; led++) {
    body.emit(
      "accent",
      body.ellipsoid([0.06, 0.505 - led * 0.033, 0.138], [0.011, 0.011, 0.006], 6, 12),
      spine,
    )
  }
  if (!body.lite) {
    body.emit(
      "metal",
      body.superEllipsoid([-0.025, 0.433, 0.138], [0.05, 0.008, 0.004], 0.4, 4, 12),
      spine,
    )
    for (const side of [-1, 1]) {
      for (let vent = 0; vent < 3; vent++) {
        body.emit(
          "secondary",
          body.superEllipsoid(
            [side * 0.162, 0.49 - vent * 0.032, 0],
            [0.006, 0.009, 0.07],
            0.4,
            4,
            12,
          ),
          spine,
        )
      }
    }
  }
  body.emit(
    "secondary",
    body.superEllipsoid([0.003, 0.45, -0.152], [0.11, 0.11, 0.04], 0.35, 10, 20),
    spine,
  )
  const firstCell = body.lite ? 1 : 0
  const endCell = body.lite ? 2 : 3
  for (let cell = firstCell; cell < endCell; cell++) {
    body.emit(
      "accent",
      body.superEllipsoid(
        [0.003 + (cell - 1) * 0.045, 0.45, -0.194],
        [0.017, 0.04, 0.005],
        0.5,
        6,
        12,
      ),
      spine,
    )
  }
  if (!body.lite) {
    const batteryScrews: [number, number][] = [
      [-0.085, 0.53],
      [0.091, 0.53],
      [-0.085, 0.37],
      [0.091, 0.37],
    ]
    for (const [x, y] of batteryScrews) {
      body.emit("metal", body.ellipsoid([x, y, -0.193], [0.01, 0.01, 0.006], 6, 10), spine)
    }
  }
  body.emit("metal", body.superEllipsoid([0.003, 0.3, 0], [0.13, 0.024, 0.105], 0.35, 6, 24), hips)
  if (!body.lite) {
    body.emit(
      "secondary",
      body.superEllipsoid([0.003, 0.284, 0], [0.138, 0.009, 0.112], 0.35, 4, 24),
      hips,
    )
  }
  body.emit(
    "secondary",
    body.superEllipsoid([0.003, 0.245, 0], [0.135, 0.045, 0.105], 0.3, 8, 24),
    hips,
  )
}
