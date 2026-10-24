import type { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItemOf, PlantKind } from "../office-layout-schema.ts"
import { PLANT_GROWERS, pottedPlant } from "../plants.ts"
import { degreesToRadians } from "../vector-math.ts"

/** A leafy plant in a pot on the floor. */
export function buildPlant(builder: FrameBuilder, item: OfficeItemOf<"plant">): void {
  pottedPlant(builder, item.size || 1)
}

/** A flat round mat on the floor. */
export function buildRoundRug(builder: FrameBuilder, item: OfficeItemOf<"round_rug">): void {
  builder.superEllipsoid(
    item.color,
    [0, 0.008, 0],
    [item.radius, 0.002, item.radius],
    0.2,
    1,
    4,
    48,
  )
}

/** A round pot (`pot` material) with soil, grown with the plant `kind`. */
export function buildBigPlant(builder: FrameBuilder, item: OfficeItemOf<"big_plant">): void {
  const scale = item.size || 1
  const radius = (item.r || 0.22) * scale
  const height = (item.h || 0.42) * scale
  builder
    .superEllipsoid(
      item.pot || "pot_charcoal",
      [0, height / 2, 0],
      [radius, height / 2, radius],
      0.12,
      1,
      6,
      24,
    )
    .superEllipsoid(
      "soil",
      [0, height + 0.002, 0],
      [radius * 0.88, 0.006, radius * 0.88],
      0.5,
      1,
      4,
      18,
    )
  PLANT_GROWERS[item.kind](builder, 0, height - 0.01, 0, scale)
  builder.block(-radius, -radius, radius, radius)
}

const DEFAULT_TROUGH_PLANTS: PlantKind[] = ["snake", "grass", "leafy", "grass"]

/**
 * A long powder-coated steel planter along local x, back against a wall at local z 0: a brushed
 * rim, a band and kick strip on the front, soil, and plants of `kinds` in turn at random spacing,
 * offset and scale.
 */
export function buildPlanterTrough(
  builder: FrameBuilder,
  item: OfficeItemOf<"planter_trough">,
): void {
  const random = builder.context.random
  const length = item.length
  const depth = item.depth || 0.42
  const height = item.height || 0.4
  const centerZ = depth / 2
  builder
    .box("machine", [0, height / 2, centerZ], [length, height, depth])
    .box("steel", [0, height + 0.015, centerZ], [length + 0.04, 0.03, depth + 0.04])
  builder
    .box("steel_dark", [0, height * 0.72, depth + 0.003], [length - 0.06, 0.035, 0.006])
    .box("steel_dark", [0, 0.03, depth + 0.003], [length - 0.06, 0.06, 0.006])
  builder.box("soil", [0, height + 0.02, centerZ], [length - 0.06, 0.01, depth - 0.06])
  const kinds = item.kinds || DEFAULT_TROUGH_PLANTS
  for (let x = -length / 2 + 0.3, k = 0; x < length / 2 - 0.2; x += 0.42 + random() * 0.18, k++) {
    const grow = PLANT_GROWERS[kinds[k % kinds.length]]
    const z = centerZ + (random() - 0.5) * 0.08
    const scale = 0.8 + random() * 0.3
    grow(builder, x, height + 0.025, z, scale)
  }
  builder.block(-length / 2 - 0.02, 0, length / 2 + 0.02, depth + 0.02)
}

/**
 * A wall clock at height `y` showing 3 o'clock: hands on the axes, so no rotated boxes are needed.
 */
export function buildWallClock(builder: FrameBuilder, item: OfficeItemOf<"wall_clock">): void {
  const y = item.y || 1.7
  const radius = item.radius || 0.22
  builder
    .superEllipsoid("furn_dark", [0, y, 0.02], [radius, radius, 0.02], 1, 1, 4, 32)
    .superEllipsoid("furn_light", [0, y, 0.042], [radius * 0.9, radius * 0.9, 0.004], 1, 1, 4, 32)
  for (let k = 0; k < 12; k++) {
    builder
      .child(0, 0, 0)
      .box(
        "furn_dark",
        [
          Math.sin((k * Math.PI) / 6) * radius * 0.75,
          y + Math.cos((k * Math.PI) / 6) * radius * 0.75,
          0.05,
        ],
        [0.012, 0.012, 0.004],
      )
  }
  const hand = (degrees: number, handLength: number, handWidth: number, z: number): void => {
    const angle = degreesToRadians(degrees)
    builder.box(
      "furn_dark",
      [(Math.sin(angle) * handLength) / 2, y + (Math.cos(angle) * handLength) / 2, z],
      [
        Math.abs(Math.sin(angle)) * handLength + handWidth,
        Math.abs(Math.cos(angle)) * handLength + handWidth,
        0.004,
      ],
    )
  }
  hand(0, radius * 0.62, 0.016, 0.054)
  hand(90, radius * 0.8, 0.01, 0.06)
  builder.superEllipsoid("metal", [0, y, 0.066], [0.016, 0.016, 0.004], 1, 1, 4, 12)
}
