import type { MeshPart } from "../geometry/mesh-part.ts"
import { TOOL_ICON_ANCHOR } from "../prop-anchors.ts"
import type { Vector3 } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/** Stroke radius of the icon glyph tubes. */
const STROKE_RADIUS = 0.017

/** How far in front of and behind the badge the terminal prompt copies sit. */
const FACE_OFFSET = 0.015

/**
 * The tool icons (what a working agent is doing right now): a dark badge with a glyph, each on its
 * own head joint resting at scale 0. No clip shows them; the product scales the current tool's
 * joint to 1. The glyph tubes run through the badge so they show on both faces; the terminal
 * prompt is drawn once per face (the back one mirrored in x) so it never reads mirrored. The
 * glyphs: terminal a `>_` prompt, search a magnifier, edit a wrench, web a globe.
 */
export function emitToolIcons(body: BodyBuilder): void {
  const [anchorX, anchorY, anchorZ] = TOOL_ICON_ANCHOR
  const at = (offsetX: number, offsetY: number, z = anchorZ): Vector3 => [
    anchorX + offsetX,
    anchorY + offsetY,
    z,
  ]
  const arc = (
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    steps: number,
    startAngle = 0,
    endAngle = 2 * Math.PI,
  ): Vector3[] =>
    Array.from({ length: steps + (endAngle - startAngle < 2 * Math.PI ? 1 : 0) }, (_, step) => {
      const angle = startAngle + ((endAngle - startAngle) * step) / steps
      return at(centerX + radiusX * Math.cos(angle), centerY + radiusY * Math.sin(angle))
    })
  const loop = (
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    steps: number,
  ) =>
    body.tube(arc(centerX, centerY, radiusX, radiusY, steps), STROKE_RADIUS * 0.85, 8, {
      closed: true,
      center: at(centerX, centerY),
    })
  const emitIcon = (joint: string, strokes: MeshPart[]) => {
    body.emit(
      "secondary",
      body.superEllipsoid(
        [anchorX, anchorY, anchorZ],
        [0.1, 0.1, 0.012],
        0.55,
        body.lite ? 4 : 6,
        body.lite ? 12 : 16,
      ),
      body.rigid(joint),
    )
    for (const stroke of strokes) body.emit("eye", stroke, body.rigid(joint))
  }
  const loopSteps = body.lite ? 6 : 10
  const capSteps = body.lite ? 1 : 2
  emitIcon(
    "icon_terminal",
    [-1, 1].flatMap((face) => {
      const onFace = (offsetX: number, offsetY: number) =>
        at(face * offsetX, offsetY, anchorZ + face * FACE_OFFSET)
      const promptRadius = STROKE_RADIUS * 0.7
      return [
        body.tube(
          [onFace(-0.05, 0.035), onFace(-0.015, 0), onFace(-0.05, -0.035)],
          promptRadius,
          8,
          {
            capSteps,
          },
        ),
        body.tube([onFace(0.005, -0.04), onFace(0.05, -0.04)], promptRadius, 8, { capSteps }),
      ]
    }),
  )
  emitIcon("icon_search", [
    loop(-0.012, 0.012, 0.036, 0.036, loopSteps),
    body.tube([at(0.016, -0.016), at(0.055, -0.055)], STROKE_RADIUS * 1.15, 8, { capSteps }),
  ])
  emitIcon("icon_edit", [
    body.tube([at(-0.052, -0.052), at(0.012, 0.012)], STROKE_RADIUS, 8, { capSteps }),
    body.tube(
      arc(0.03, 0.03, 0.03, 0.03, loopSteps - 2, Math.PI * 0.5, Math.PI * 2),
      STROKE_RADIUS * 0.85,
      8,
      { capSteps },
    ),
  ])
  emitIcon("icon_web", [
    loop(0, 0, 0.058, 0.058, loopSteps + 2),
    loop(0, 0, 0.022, 0.058, loopSteps),
    body.tube([at(-0.058, 0), at(0.058, 0)], STROKE_RADIUS * 0.7, 8, { caps: false }),
  ])
}
