import type { MeshPart } from "../geometry/mesh-part.ts"
import { transformPart } from "../geometry/mesh-part.ts"
import { STATUS_GLYPH_ANCHOR } from "../prop-anchors.ts"
import { addVectors, type Vector3 } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/** Glyph scale relative to the authored sizes. */
const GLYPH_SCALE = 1.5

/** Stroke radius of the glyph tubes. */
const STROKE_RADIUS = 0.016 * GLYPH_SCALE

/** How far in front of and behind the backing disc each glyph copy sits. */
const FACE_OFFSET = 0.018

/**
 * The status glyphs: "?" (waiting for the user) on `bubble_q` and "!" (an error) on
 * `bubble_alert`, each on its own head joint resting at scale 0. A dark backing disc gives contrast
 * on light floors. Each glyph is built in the plane z = 0 and placed on both faces: the back copy
 * is mirrored in x so it reads the right way round when the robot faces away from the camera.
 */
export function emitStatusGlyphs(body: BodyBuilder): void {
  const [anchorX, anchorY, anchorZ] = STATUS_GLYPH_ANCHOR
  const placeOnFaces: ((position: Vector3) => Vector3)[] = [
    (position) => [position[0], position[1], anchorZ + FACE_OFFSET],
    (position) => [2 * anchorX - position[0], position[1], anchorZ - FACE_OFFSET],
  ]
  const emitGlyph = (joint: string, buildStrokes: () => MeshPart[]) => {
    body.emit(
      "secondary",
      body.superEllipsoid([anchorX, anchorY + 0.006, anchorZ], [0.105, 0.125, 0.014], 0.55, 6, 14),
      body.rigid(joint),
    )
    for (const placeOnFace of placeOnFaces) {
      for (const stroke of buildStrokes()) {
        body.emit("eye", transformPart(stroke, placeOnFace), body.rigid(joint))
      }
    }
  }
  const dot = () =>
    body.ellipsoid(
      [anchorX, anchorY - 0.062 * GLYPH_SCALE, 0],
      [STROKE_RADIUS * 1.2, STROKE_RADIUS * 1.2, STROKE_RADIUS * 0.8],
      6,
      10,
    )
  emitGlyph("bubble_q", () => {
    const hookCenter: Vector3 = [anchorX, anchorY + 0.045 * GLYPH_SCALE, 0]
    const hook: Vector3[] = []
    for (let step = 0; step <= 7; step++) {
      const angle = Math.PI * (1 - (step / 7) * 1.45)
      hook.push(
        addVectors(hookCenter, [
          0.042 * GLYPH_SCALE * Math.cos(angle),
          0.042 * GLYPH_SCALE * Math.sin(angle),
          0,
        ]),
      )
    }
    const stemEnd: Vector3 = [anchorX, anchorY - 0.02 * GLYPH_SCALE, 0]
    return [body.tube([...hook, stemEnd], STROKE_RADIUS, 8, { capSteps: 2 }), dot()]
  })
  emitGlyph("bubble_alert", () => [
    body.tube(
      body.densify(
        [
          [anchorX, anchorY + 0.085 * GLYPH_SCALE, 0],
          [anchorX, anchorY - 0.02 * GLYPH_SCALE, 0],
        ],
        0.03,
      ),
      (fraction) => STROKE_RADIUS * (1.25 - 0.45 * fraction),
      8,
      { capSteps: 2 },
    ),
    dot(),
  ])
}
