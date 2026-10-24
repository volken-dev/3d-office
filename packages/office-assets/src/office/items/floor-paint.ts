import type { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { floorStencil } from "../stencil-text.ts"
import type { Vector2 } from "../vector-math.ts"

/** Floor paint height: above the floors (0.0015 and 0.003) and clear of mats. */
const PAINT_Y = 0.009

/** Clips a convex polygon to minX <= x <= maxX (Sutherland-Hodgman against two half-planes). */
function clipPolygonToXRange(points: Vector2[], minX: number, maxX: number): Vector2[] {
  let clipped = points
  const halfPlanes: [number, number][] = [
    [1, minX],
    [-1, maxX],
  ]
  for (const [side, edge] of halfPlanes) {
    const kept: Vector2[] = []
    const input = clipped
    input.forEach((point, index) => {
      const next = input[(index + 1) % input.length]
      const pointInside = side * (point[0] - edge) >= 0
      const nextInside = side * (next[0] - edge) >= 0
      if (pointInside) kept.push(point)
      if (pointInside !== nextInside) {
        const fraction = (edge - point[0]) / (next[0] - point[0])
        kept.push([edge, point[1] + fraction * (next[1] - point[1])])
      }
    })
    clipped = kept
    if (clipped.length < 3) return []
  }
  return clipped
}

/** A painted keep-out zone: an outline round `rect` and 45-degree stripes inside it. */
export function buildFloorHatch(builder: FrameBuilder, item: OfficeItemOf<"floor_hatch">): void {
  const [x0, z0, x1, z1] = item.rect
  const lineWidth = item.line || 0.05
  const pitch = item.pitch || 0.24
  const stripeWidth = pitch * 0.45
  builder.outline("floor_paint", x0, z0, x1, z1, lineWidth, PAINT_Y)
  const innerX0 = x0 + lineWidth / 2 + 0.05
  const innerX1 = x1 - lineWidth / 2 - 0.05
  const innerZ0 = z0 + lineWidth / 2 + 0.05
  const innerZ1 = z1 - lineWidth / 2 - 0.05
  const innerDepth = innerZ1 - innerZ0
  for (let u = innerX0 - innerDepth; u < innerX1; u += pitch) {
    const stripe = clipPolygonToXRange(
      [
        [u, innerZ1],
        [u + stripeWidth, innerZ1],
        [u + stripeWidth + innerDepth, innerZ0],
        [u + innerDepth, innerZ0],
      ],
      innerX0,
      innerX1,
    )
    if (stripe.length >= 3) builder.polygon("floor_paint", stripe, PAINT_Y)
  }
}

/** Stencilled floor text centred on the item, reading upright from +z. */
export function buildFloorText(builder: FrameBuilder, item: OfficeItemOf<"floor_text">): void {
  floorStencil(builder, item.color || "floor_paint", item.text, 0, 0, item.px || 0.05, PAINT_Y)
}

/** Painted chevrons pointing along local +x, one at each of `xs`. */
export function buildFloorArrows(builder: FrameBuilder, item: OfficeItemOf<"floor_arrows">): void {
  const size = item.size || 0.22
  const strokeWidth = size * 0.32
  for (const x of item.xs) {
    for (const side of [-1, 1]) {
      builder.polygon(
        item.color || "floor_paint",
        [
          [x - size / 2, side * size],
          [x - size / 2 + strokeWidth, side * size],
          [x + size / 2 + strokeWidth, 0],
          [x + size / 2, 0],
        ],
        PAINT_Y,
      )
    }
  }
}

/** Painted floor lines, one quad per `[x0, z0, x1, z1]` rectangle. */
export function buildFloorLines(builder: FrameBuilder, item: OfficeItemOf<"floor_lines">): void {
  for (const [x0, z0, x1, z1] of item.rects) {
    builder.quad(
      item.color || "floor_line",
      [(x0 + x1) / 2, PAINT_Y, (z0 + z1) / 2],
      [(x1 - x0) / 2, 0, 0],
      [0, 0, -(z1 - z0) / 2],
    )
  }
}
