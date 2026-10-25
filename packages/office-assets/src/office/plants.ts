import type { FrameBuilder } from "./frame-builder.ts"
import type { PlantKind } from "./office-layout-schema.ts"
import type { Vector3 } from "./vector-math.ts"

/** Grows a plant whose base is at (x, soilY, z), scaled by `scale`. */
type PlantGrower = (
  builder: FrameBuilder,
  x: number,
  soilY: number,
  z: number,
  scale: number,
) => void

/** A leaf clump: offset from the base `[x, y, z]`, radius, vertical radius, material. */
type LeafClump = [number, number, number, number, number, string]

const POTTED_PLANT_LEAVES: LeafClump[] = [
  [0, 0.45, 0, 0.2, 0.15, "plant_leaf"],
  [0.08, 0.6, 0.05, 0.15, 0.13, "plant_leaf2"],
  [-0.09, 0.68, -0.04, 0.13, 0.13, "plant_leaf"],
  [0.02, 0.82, 0.0, 0.1, 0.1, "plant_leaf2"],
  [-0.06, 0.52, 0.09, 0.12, 0.1, "plant_leaf2"],
]

const LEAFY_CLUMPS: LeafClump[] = [
  [0, 0.13, 0, 0.2, 0.15, "plant_leaf"],
  [0.08, 0.28, 0.05, 0.15, 0.13, "plant_leaf2"],
  [-0.09, 0.36, -0.04, 0.13, 0.13, "plant_leaf"],
  [0.02, 0.5, 0, 0.1, 0.1, "plant_leaf2"],
  [-0.06, 0.2, 0.09, 0.12, 0.1, "plant_leaf2"],
]

/** A leafy plant in a pot standing on the floor (the pot's base at y 0), scaled by `scale`. */
export function pottedPlant(builder: FrameBuilder, scale = 1): void {
  builder.superEllipsoid(
    "pot",
    [0, 0.16 * scale, 0],
    [0.15 * scale, 0.16 * scale, 0.15 * scale],
    0.15,
    0.55,
    8,
    18,
  )
  builder.superEllipsoid(
    "soil",
    [0, 0.315 * scale, 0],
    [0.13 * scale, 0.01, 0.13 * scale],
    0.5,
    0.55,
    4,
    14,
  )
  for (const [x, y, z, radius, verticalRadius, material] of POTTED_PLANT_LEAVES) {
    builder.superEllipsoid(
      material,
      [x * scale, y * scale, z * scale],
      [radius * scale, verticalRadius * scale, radius * scale],
      0.55,
      0.6,
      8,
      14,
    )
  }
  builder.block(-0.17 * scale, -0.17 * scale, 0.17 * scale, 0.17 * scale)
}

/**
 * The plant kinds for pots and troughs, each grown from its base at (x, soilY, z). For a plant on a
 * desk or shelf, place a pot at that height and grow one of these on it.
 */
export const PLANT_GROWERS: Record<PlantKind, PlantGrower> = {
  leafy(builder, x, soilY, z, scale) {
    for (const [offsetX, y, offsetZ, radius, verticalRadius, material] of LEAFY_CLUMPS) {
      builder.superEllipsoid(
        material,
        [x + offsetX * scale, soilY + y * scale, z + offsetZ * scale],
        [radius * scale, verticalRadius * scale, radius * scale],
        0.55,
        0.6,
        6,
        11,
      )
    }
  },
  /** Upright blades fanning out from the middle. */
  snake(builder, x, soilY, z, scale) {
    const random = builder.context.random
    for (let k = 0; k < 9; k++) {
      const angle = (k * 137.5 * Math.PI) / 180
      const spread = 0.03 + 0.05 * random()
      const height = (0.45 + 0.35 * random()) * scale
      builder.tube(
        k % 3 ? "plant_snake" : "plant_leaf",
        [x + Math.cos(angle) * spread * 0.4, soilY, z + Math.sin(angle) * spread * 0.4],
        [
          x + Math.cos(angle) * (spread + 0.06 * scale),
          soilY + height,
          z + Math.sin(angle) * (spread + 0.06 * scale),
        ],
        0.028 * scale,
        0.004,
        5,
      )
    }
  },
  grass(builder, x, soilY, z, scale) {
    const random = builder.context.random
    for (let k = 0; k < 14; k++) {
      const angle = (k * 137.5 * Math.PI) / 180
      const reach = (0.18 + 0.2 * random()) * scale
      const height = (0.3 + 0.25 * random()) * scale
      builder.tube(
        k % 2 ? "plant_grass" : "plant_leaf2",
        [x, soilY, z],
        [x + Math.cos(angle) * reach, soilY + height, z + Math.sin(angle) * reach],
        0.012 * scale,
        0.002,
        4,
      )
    }
  },
  /** A fiddle-leaf fig: a cane with big leaves held out at all angles. */
  fiddle(builder, x, soilY, z, scale) {
    const random = builder.context.random
    const top = soilY + 1.15 * scale
    builder.tube(
      "wood_dark",
      [x, soilY, z],
      [x + 0.03 * scale, top, z - 0.02 * scale],
      0.022 * scale,
      0.012 * scale,
      6,
    )
    for (let k = 0; k < 16; k++) {
      const caneFraction = 0.3 + (0.7 * k) / 15
      const angle = k * 2.39996 + random() * 0.5
      const reach = (0.1 + 0.08 * (1 - caneFraction) + 0.04 * random()) * scale
      const y = soilY + caneFraction * 1.15 * scale
      const leafSize = (0.09 + 0.04 * random()) * scale
      const leafCenter: Vector3 = [x + Math.cos(angle) * reach, y, z + Math.sin(angle) * reach]
      builder.tube(
        "wood_dark",
        [x + 0.02 * scale * caneFraction, y - 0.06 * scale, z],
        leafCenter,
        0.006 * scale,
        0.004 * scale,
        4,
      )
      builder.superEllipsoid(
        k % 3 ? "plant_fig" : "plant_leaf",
        leafCenter,
        [leafSize, leafSize * 0.55, leafSize * 1.15],
        0.65,
        0.8,
        5,
        9,
      )
    }
  },
  /** A small tree: a trunk, three limbs and a cloud of small leaf clumps round their tips. */
  olive(builder, x, soilY, z, scale) {
    const fork: Vector3 = [x + 0.02, soilY + 0.75 * scale, z]
    builder.tube("wood_dark", [x, soilY, z], fork, 0.04 * scale, 0.03 * scale, 7)
    const limbOffsets: Vector3[] = [
      [-0.22, 1.25, 0.05],
      [0.2, 1.3, -0.08],
      [0.02, 1.45, 0.1],
    ]
    const tips = limbOffsets.map(
      ([offsetX, y, offsetZ]): Vector3 => [
        x + offsetX * scale,
        soilY + y * scale,
        z + offsetZ * scale,
      ],
    )
    for (const tip of tips) builder.tube("wood_dark", fork, tip, 0.025 * scale, 0.012 * scale, 6)
    for (let k = 0; k < 34; k++) {
      const tip = tips[k % 3]
      const angle = k * 2.39996
      const elevation = 1 - (2 * (k + 0.5)) / 34
      const cloudRadius = 0.24 * scale
      builder.superEllipsoid(
        k % 3 ? "plant_olive" : "plant_leaf",
        [
          tip[0] + Math.cos(angle) * Math.sqrt(1 - elevation * elevation) * cloudRadius,
          tip[1] + elevation * cloudRadius * 0.6,
          tip[2] + Math.sin(angle) * Math.sqrt(1 - elevation * elevation) * cloudRadius,
        ],
        [0.08 * scale, 0.055 * scale, 0.08 * scale],
        0.6,
        0.8,
        4,
        8,
      )
    }
  },
}
