import { FrameBuilder } from "./frame-builder.ts"
import type { OfficeBuildContext } from "./office-build-context.ts"
import type { Vector2 } from "./vector-math.ts"

/**
 * The glass partitions: straight runs along x or z from `from` to `to`, split at their door gaps.
 * Each span is a pane (5 mm clear of the mullion tops) between a bottom rail above the skirting
 * and a top rail, both 1 cm proud of the mullions, with mullions about every `pitch` metres
 * between the rails, and is an obstacle on the walk grid. Each door gap gets a header.
 */
export function buildGlassPartitions(context: OfficeBuildContext): void {
  const wallHeight = context.layout.room.wallHeight
  for (const partition of context.layout.glass) {
    const glass = new FrameBuilder(context, "static-glass")
    const frame = new FrameBuilder(context, "static-architecture")
    const [startX, startZ] = partition.from
    const [endX, endZ] = partition.to
    const alongX = Math.abs(endZ - startZ) < 1e-6
    const start = alongX ? startX : startZ
    const end = alongX ? endX : endZ
    const across = alongX ? startZ : startX
    const doorGaps = (partition.doors || (partition.door ? [partition.door] : []))
      .map(
        ([gapStart, gapEnd]): Vector2 => [Math.min(gapStart, gapEnd), Math.max(gapStart, gapEnd)],
      )
      .sort((first, second) => first[0] - second[0])
    const spans: Vector2[] = []
    let cursor = Math.min(start, end)
    for (const [gapStart, gapEnd] of doorGaps) {
      spans.push([cursor, gapStart])
      cursor = gapEnd
    }
    spans.push([cursor, Math.max(start, end)])
    const alongBox = (
      builder: FrameBuilder,
      material: string,
      along: number,
      alongLength: number,
      y: number,
      height: number,
      depth = 0.05,
    ): void => {
      if (alongX) builder.box(material, [along, y, across], [alongLength, height, depth])
      else builder.box(material, [across, y, along], [depth, height, alongLength])
    }
    for (const [spanStart, spanEnd] of spans) {
      alongBox(
        glass,
        "glass",
        (spanStart + spanEnd) / 2,
        spanEnd - spanStart - 0.01,
        wallHeight / 2 - 0.005,
        wallHeight - 0.13,
        0.012,
      )
      alongBox(frame, "frame", (spanStart + spanEnd) / 2, spanEnd - spanStart, 0.045, 0.09, 0.06)
      alongBox(
        frame,
        "frame",
        (spanStart + spanEnd) / 2,
        spanEnd - spanStart,
        wallHeight - 0.03,
        0.06,
        0.06,
      )
      const bays = Math.max(1, Math.round((spanEnd - spanStart) / (partition.pitch || 0.9)))
      for (let k = 0; k <= bays; k++) {
        alongBox(
          frame,
          "frame",
          spanStart + 0.025 + ((spanEnd - spanStart - 0.05) * k) / bays,
          0.05,
          (0.09 + wallHeight - 0.06) / 2,
          wallHeight - 0.06 - 0.09,
        )
      }
      context.obstacles.push(
        alongX
          ? {
              kind: "rectangle",
              minX: Math.min(spanStart, spanEnd),
              minZ: across - 0.03,
              maxX: Math.max(spanStart, spanEnd),
              maxZ: across + 0.03,
            }
          : {
              kind: "rectangle",
              minX: across - 0.03,
              minZ: Math.min(spanStart, spanEnd),
              maxX: across + 0.03,
              maxZ: Math.max(spanStart, spanEnd),
            },
      )
    }
    for (const [gapStart, gapEnd] of doorGaps) {
      alongBox(frame, "frame", (gapStart + gapEnd) / 2, gapEnd - gapStart + 0.05, 1.95, 0.06)
    }
  }
}
