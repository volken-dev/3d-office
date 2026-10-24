import { buildFloors } from "./floors.ts"
import { FrameBuilder } from "./frame-builder.ts"
import { buildGlassPartitions } from "./glass-partitions.ts"
import type { OfficeBuildContext } from "./office-build-context.ts"
import { buildWalls } from "./walls.ts"

/** The sky backdrops: `day-only-*` and `night-only-*` nodes, toggled by time of day. */
const SKY_BACKDROPS: [string, string][] = [
  ["day-only-sky", "sky_day"],
  ["night-only-sky", "sky_night"],
]

/**
 * The room: the plinth under it with a glowing border (`colored-border`), the floors, the walls
 * with their openings, the sky backdrops just behind the back walls (below the sightline over the
 * wall top) and the glass partitions. Order matters: it is the geometry's order in the GLB.
 */
export function buildArchitecture(context: OfficeBuildContext): void {
  const {
    x: [minX, maxX],
    z: [minZ, maxZ],
    wallThickness: thickness,
  } = context.layout.room
  const architecture = new FrameBuilder(context, "static-architecture")
  architecture.box(
    "plinth",
    [(minX + maxX) / 2, -0.156, (minZ + maxZ) / 2],
    [maxX - minX + 2 * thickness + 0.5, 0.3, maxZ - minZ + 2 * thickness + 0.5],
  )
  const border = new FrameBuilder(context, "colored-border")
  const borderWidth = maxX - minX + 2 * thickness + 0.52
  const borderDepth = maxZ - minZ + 2 * thickness + 0.52
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  border
    .box("border_glow", [centerX, -0.03, centerZ + borderDepth / 2], [borderWidth, 0.025, 0.012])
    .box("border_glow", [centerX, -0.03, centerZ - borderDepth / 2], [borderWidth, 0.025, 0.012])
  border
    .box(
      "border_glow",
      [centerX + borderWidth / 2, -0.03, centerZ],
      [0.012, 0.025, borderDepth - 0.012],
    )
    .box(
      "border_glow",
      [centerX - borderWidth / 2, -0.03, centerZ],
      [0.012, 0.025, borderDepth - 0.012],
    )
  buildFloors(context)
  buildWalls(architecture, context.layout)
  for (const [node, material] of SKY_BACKDROPS) {
    const sky = new FrameBuilder(context, node)
    const distanceBehind = 0.3
    const top = 1.9
    const bottom = -0.2
    const centerY = (top + bottom) / 2
    const halfHeight = (top - bottom) / 2
    sky.quad(
      material,
      [(minX + maxX) / 2, centerY, minZ - thickness - distanceBehind],
      [(maxX - minX) / 2 + thickness, 0, 0],
      [0, halfHeight, 0],
    )
    sky.quad(
      material,
      [minX - thickness - distanceBehind, centerY, (minZ + maxZ) / 2],
      [0, 0, -((maxZ - minZ) / 2 + thickness)],
      [0, halfHeight, 0],
    )
  }
  buildGlassPartitions(context)
}
