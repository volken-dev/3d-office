import type { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { officeChair } from "../seats.ts"
import { wallStencil } from "../stencil-text.ts"
import { degreesToRadians } from "../vector-math.ts"

/** The console screens round the meeting-room desk, cycling by seat. */
const CONSOLE_SCREENS = ["term", "code_a", "code_b", "term"]

/** The video wall's screens, left to right, unless the item lists its own. */
const DEFAULT_VIDEO_WALL = ["status", "ci", "chart"]

/**
 * The glass meeting room's furniture: a video wall at local z 0 facing +z on two legs, and a
 * curved console (top, brushed front lip, modesty panel on the wall side, end pedestals) of radius
 * `radius` spanning the seat angles. Seat k at `angles[k]` (degrees) faces the wall, with a monitor,
 * keyboard and office chair, and is `poi-sit_idle-<ids[k]>`.
 */
export function buildControlRoom(builder: FrameBuilder, item: OfficeItemOf<"control_room">): void {
  const consoleRadius = item.radius || 1.7
  const seatRadius = consoleRadius + 0.42
  const wallWidth = 2.7
  const wallBottom = 0.45
  const wallTop = 1.35
  for (const x of [-wallWidth / 2 + 0.15, wallWidth / 2 - 0.15]) {
    builder
      .box("steel_dark", [x, wallBottom / 2, 0], [0.08, wallBottom, 0.08])
      .box("steel_dark", [x, 0.01, 0], [0.12, 0.02, 0.5])
  }
  builder
    .box("steel_dark", [0, (wallBottom + wallTop) / 2, 0], [wallWidth, wallTop - wallBottom, 0.08])
    .box("steel", [0, wallTop + 0.02, 0], [wallWidth + 0.02, 0.04, 0.1])
  ;(item.wall || DEFAULT_VIDEO_WALL).forEach((screen, index) => {
    builder.quad(
      `screen_${screen}`,
      [(index - 1) * 0.88, (wallBottom + wallTop) / 2, 0.046],
      [0.41, 0, 0],
      [0, 0.4, 0],
      "static-screens",
    )
  })
  builder.block(-wallWidth / 2, -0.26, wallWidth / 2, 0.26)
  const startAngle = Math.min(...item.angles) - 13
  const endAngle = Math.max(...item.angles) + 13
  builder
    .ring(
      "bench_top",
      consoleRadius - 0.25,
      consoleRadius + 0.25,
      0.46,
      0.5,
      startAngle,
      endAngle,
      32,
    )
    .ring("steel", consoleRadius + 0.25, consoleRadius + 0.27, 0.465, 0.5, startAngle, endAngle, 32)
  builder.ring(
    "steel_dark",
    consoleRadius - 0.23,
    consoleRadius - 0.2,
    0.04,
    0.46,
    startAngle,
    endAngle,
    32,
  )
  const pedestals: [number, number][] = [
    [startAngle + 0.3, startAngle + 2],
    [endAngle - 2, endAngle - 0.3],
  ]
  for (const [pedestalStart, pedestalEnd] of pedestals) {
    builder.ring(
      "steel_dark",
      consoleRadius - 0.24,
      consoleRadius + 0.24,
      0.02,
      0.455,
      pedestalStart,
      pedestalEnd,
      1,
    )
  }
  item.angles.forEach((angle, seat) => {
    const seatFrame = builder.child(
      seatRadius * Math.sin(degreesToRadians(angle)),
      -seatRadius * Math.cos(degreesToRadians(angle)),
      180 - angle,
    )
    seatFrame
      .box("furn_dark", [0, 0.73, -0.55], [0.46, 0.27, 0.025])
      .quad(
        `screen_${CONSOLE_SCREENS[seat % 4]}`,
        [0, 0.73, -0.5325],
        [0.21, 0, 0],
        [0, 0.12, 0],
        "static-screens",
      )
    seatFrame
      .box("furn_dark", [0, 0.57, -0.575], [0.04, 0.12, 0.025])
      .box("furn_dark", [0, 0.506, -0.56], [0.16, 0.012, 0.11])
    seatFrame
      .box("furn_dark", [0, 0.508, -0.32], [0.36, 0.016, 0.12])
      .box("metal", [0, 0.518, -0.32], [0.33, 0.005, 0.1])
    officeChair(seatFrame.child(0, 0, 180), "fabric_chair")
    seatFrame.block(-0.42, -0.68, 0.42, -0.15)
    seatFrame.pointOfInterest("sit_idle", item.ids[seat], 0, 0, 180)
  })
}

/**
 * A training pod: the robot reclines facing +z (seat height about 0.32 m) under a halo that
 * "trains" it. The halo floats above the seated head, and the antenna passes through its middle.
 */
export function buildTrainingPod(builder: FrameBuilder, item: OfficeItemOf<"training_pod">): void {
  const fabric = item.color || "felt_navy"
  builder
    .superEllipsoid("steel_dark", [0, 0.02, 0], [0.36, 0.02, 0.34], 0.3, 1, 4, 24)
    .superEllipsoid("machine", [0, 0.15, 0], [0.26, 0.12, 0.24], 0.3, 0.4, 7, 16)
  builder.superEllipsoid(fabric, [0, 0.29, 0.02], [0.27, 0.03, 0.24], 0.4, 0.4, 5, 16)
  builder
    .superEllipsoid("machine", [0, 0.56, -0.27], [0.31, 0.3, 0.08], 0.35, 0.35, 7, 16)
    .superEllipsoid(fabric, [0, 0.56, -0.185], [0.25, 0.24, 0.012], 0.4, 0.4, 5, 16)
  for (const x of [-0.34, 0.34]) builder.box("machine", [x, 0.37, 0], [0.07, 0.09, 0.42])
  builder
    .box("steel", [0, 1.12, -0.42], [0.05, 1.02, 0.05])
    .box("steel", [0, 1.627, -0.23], [0.06, 0.04, 0.4])
  builder
    .ring("steel_dark", 0.36, 0.43, 1.6, 1.64, 0, 360, 24)
    .ring("led", 0.37, 0.42, 1.595, 1.6, 0, 360, 24)
  builder.block(-0.4, -0.42, 0.4, 0.3)
  builder.pointOfInterest(item.poiKind || "sit_idle", item.id, 0, 0.06, 0)
}

/** The parts bins on the maintenance bar's shelf, left to right. */
const SERVICE_SHELF_BINS = ["bin_navy", "bin_teal", "bin_sand", "bin_navy", "bin_teal"]

/**
 * The maintenance bar against the wall (local z 0), front +z: a counter, a backsplash with gauges,
 * coolant and oil dispensers (tank, label band, spout, drip tray), a can under the coolant spout,
 * a shelf of parts bins, the SERVICE sign and a parts locker. `poi-use_coffee-1` stands at the
 * coolant spout, and three coolant vapour puffs (`anim-steam-N`) rise off the can in clip Ambient.
 */
export function buildServiceBar(builder: FrameBuilder): void {
  const context = builder.context
  const centerX = -0.3
  const width = 1.9
  builder
    .box("machine", [centerX, 0.25, 0.27], [width, 0.5, 0.5])
    .box("steel", [centerX, 0.525, 0.29], [width + 0.04, 0.05, 0.56])
  for (let k = 1; k < 4; k++) {
    builder.box(
      "steel_dark",
      [centerX - width / 2 + (k * width) / 4, 0.25, 0.523],
      [0.008, 0.44, 0.006],
    )
  }
  builder.box("steel_dark", [centerX, 0.86, 0.012], [width, 0.6, 0.012])
  for (const x of [-0.05, 0.2]) {
    builder
      .superEllipsoid("furn_light", [x, 0.95, 0.024], [0.07, 0.07, 0.006], 1, 1, 4, 16)
      .box("furn_dark", [x + 0.015, 0.96, 0.032], [0.006, 0.05, 0.004])
  }
  const dispensers: [number, string][] = [
    [-0.75, "bin_teal"],
    [-0.4, "bin_sand"],
  ]
  for (const [x, band] of dispensers) {
    builder
      .superEllipsoid("steel", [x, 0.76, 0.2], [0.11, 0.2, 0.11], 0.2, 1, 8, 16)
      .superEllipsoid(band, [x, 0.8, 0.2], [0.114, 0.04, 0.114], 0.2, 1, 4, 16)
    builder
      .box("furn_dark", [x, 0.67, 0.33], [0.04, 0.03, 0.1])
      .box("steel_dark", [x, 0.556, 0.36], [0.16, 0.012, 0.12])
  }
  builder.superEllipsoid("steel_dark", [-0.75, 0.6, 0.36], [0.03, 0.035, 0.03], 0.15, 1, 6, 12)
  builder.box("steel", [centerX, 1.38, 0.15], [width, 0.03, 0.3])
  ;[-0.95, -0.6, -0.25, 0.1, 0.45].forEach((x, index) => {
    builder.box(SERVICE_SHELF_BINS[index], [x, 1.46, 0.16], [0.28, 0.13, 0.26])
  })
  wallStencil(builder, "floor_paint", "SERVICE", centerX, 1.78, 0.006, 0.026)
  builder.box("steel_dark", [0.95, 0.68, 0.31], [0.58, 1.36, 0.6])
  for (let row = 0; row < 3; row++) {
    for (const x of [0.81, 1.09]) {
      builder
        .box("steel", [x, 0.27 + row * 0.4, 0.613], [0.25, 0.36, 0.006])
        .box("furn_dark", [x - 0.09, 0.27 + row * 0.4, 0.619], [0.02, 0.06, 0.006])
    }
  }
  builder.box("led", [0.95, 1.3, 0.613], [0.1, 0.03, 0.006])
  builder.block(-1.25, 0, 1.25, 0.62)
  builder.pointOfInterest("use_coffee", 1, -0.75, 0.95, 180)
  for (let k = 1; k <= 3; k++) {
    const node = `anim-steam-${k}`
    context.animationPivots.set(node, builder.point([-0.75, 0.64, 0.36]))
    builder
      .inNode(node)
      .superEllipsoid("steam", [-0.75, 0.64, 0.36], [0.024, 0.024, 0.024], 1, 1, 6, 10)
  }
}

/**
 * The standing service counter in the maintenance bar, with two oil cans; robots chat round it at
 * `poi-coffee_chat-1` to `-3`.
 */
export function buildBarTable(builder: FrameBuilder): void {
  builder
    .superEllipsoid("steel_dark", [0, 0.015, 0], [0.28, 0.015, 0.28], 0.2, 1, 4, 24)
    .box("steel", [0, 0.31, 0], [0.05, 0.6, 0.05])
  builder
    .superEllipsoid("bench_top", [0, 0.625, 0], [0.38, 0.022, 0.38], 0.2, 1, 6, 32)
    .ring("steel", 0.38, 0.39, 0.605, 0.645, 0, 360, 32)
  builder
    .superEllipsoid("steel", [0.1, 0.68, 0.06], [0.03, 0.04, 0.03], 0.15, 1, 6, 12)
    .superEllipsoid("bin_teal", [-0.12, 0.68, -0.04], [0.03, 0.04, 0.03], 0.15, 1, 6, 12)
  builder.block(-0.4, -0.4, 0.4, 0.4)
  ;[45, 165, 285].forEach((degrees, index) => {
    builder.pointOfInterest(
      "coffee_chat",
      index + 1,
      0.78 * Math.sin(degreesToRadians(degrees)),
      0.78 * Math.cos(degreesToRadians(degrees)),
      degrees + 180,
    )
  })
}
