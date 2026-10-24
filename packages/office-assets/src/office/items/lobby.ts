import type { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { wallStencil } from "../stencil-text.ts"

/** The agent board's texture size in pixels (scene extras `agentBoard.pixels`). */
const AGENT_BOARD_PIXELS: [number, number] = [512, 288]

/**
 * A framed screen on a wall at local z 0, centred at height `y`. With `board: true` it is the live
 * agent board: its own node `agent-board` and material `agent_board` (u 0 to 1 left to right, v 0
 * to 1 top to bottom), recorded in scene extras `agentBoard`; otherwise a screen into the atlas.
 * An optional `poi` stands in front of it.
 */
export function buildWallScreen(builder: FrameBuilder, item: OfficeItemOf<"wall_screen">): void {
  const [width, height] = item.size
  const y = item.y
  builder.box("furn_dark", [0, y, 0.025], [width + 0.07, height + 0.07, 0.04])
  if (item.board) {
    builder.quad("agent_board", [0, y, 0.051], [width / 2, 0, 0], [0, height / 2, 0], "agent-board")
    builder.context.agentBoard = {
      node: "agent-board",
      material: "agent_board",
      size: [width, height],
      pixels: AGENT_BOARD_PIXELS,
      center: builder.transform().point([0, y, 0.051]),
    }
  } else {
    builder.quad(
      `screen_${item.screen}`,
      [0, y, 0.051],
      [width / 2, 0, 0],
      [0, height / 2, 0],
      "static-screens",
    )
  }
  if (item.poi) {
    builder.pointOfInterest(item.poi.kind, null, item.poi.at[0], item.poi.at[1], item.poi.rot)
  }
}

/**
 * The arrivals scanner: a frame across the path in from the door, LED strips on the inner faces of
 * its posts and a header with its text facing local +z.
 */
export function buildScanGate(builder: FrameBuilder, item: OfficeItemOf<"scan_gate">): void {
  const width = item.width || 2.2
  const height = 1.75
  for (const side of [-1, 1]) {
    builder
      .box("machine", [side * (width / 2), height / 2, 0], [0.14, height, 0.2])
      .box("led", [side * (width / 2 - 0.073), 0.9, 0], [0.006, 1.2, 0.04])
    builder
      .box("steel_dark", [side * (width / 2), 0.01, 0], [0.2, 0.02, 0.26])
      .block(side * (width / 2) - 0.09, -0.12, side * (width / 2) + 0.09, 0.12)
  }
  builder.box("machine", [0, height + 0.06, 0], [width + 0.16, 0.12, 0.2])
  wallStencil(builder, "floor_paint", item.text || "ARRIVALS", 0, height + 0.06, 0.105, 0.012)
}

/**
 * Hang-out seating: shells on a steel beam (seating as a style for hanging out, not literal station
 * seats), robots sitting facing +z, armrests between the seats. `pois` maps a seat index to the
 * `sit_idle` id it carries.
 */
export function buildSeatRow(builder: FrameBuilder, item: OfficeItemOf<"seat_row">): void {
  const seatCount = item.count || 5
  const spacing = item.spacing || 0.8
  const rowWidth = seatCount * spacing
  const shell = item.shell || "bin_teal"
  builder.box("steel_dark", [0, 0.2, -0.06], [rowWidth + 0.1, 0.07, 0.09])
  for (const x of [-rowWidth / 2 + 0.15, 0, rowWidth / 2 - 0.15]) {
    builder
      .box("steel_dark", [x, 0.0825, -0.06], [0.07, 0.165, 0.07])
      .box("steel_dark", [x, 0.006, -0.06], [0.1, 0.012, 0.4])
  }
  for (let seat = 0; seat < seatCount; seat++) {
    const x = -rowWidth / 2 + spacing * (seat + 0.5)
    builder
      .box("steel_dark", [x, 0.255, -0.03], [0.05, 0.04, 0.14])
      .superEllipsoid(shell, [x, 0.29, 0.02], [0.23, 0.022, 0.2], 0.35, 0.4, 4, 16)
    builder
      .box("steel_dark", [x, 0.42, -0.215], [0.04, 0.26, 0.03])
      .superEllipsoid(shell, [x, 0.56, -0.19], [0.23, 0.2, 0.022], 0.35, 0.4, 5, 16)
    const poiId = item.pois?.[String(seat)]
    if (poiId !== undefined) builder.pointOfInterest("sit_idle", poiId, x, 0.04, 0)
  }
  for (let seat = 1; seat < seatCount; seat++) {
    builder
      .box("steel_dark", [-rowWidth / 2 + spacing * seat, 0.37, -0.05], [0.03, 0.12, 0.03])
      .box("steel_dark", [-rowWidth / 2 + spacing * seat, 0.44, 0.0], [0.04, 0.03, 0.24])
  }
  builder.block(-rowWidth / 2, -0.27, rowWidth / 2, 0.22)
}

/** A crate-style low table for the hang-out, with two oil cans on it. */
export function buildLowTable(builder: FrameBuilder, item: OfficeItemOf<"low_table">): void {
  const [width, depth] = item.size || [1.4, 0.45]
  builder
    .box("pallet", [0, 0.03, 0], [width, 0.06, depth])
    .box("bench_top", [0, 0.2, 0], [width - 0.06, 0.28, depth - 0.06])
    .box("steel", [0, 0.35, 0], [width, 0.02, depth])
  builder
    .superEllipsoid("steel", [-0.3, 0.39, 0.05], [0.03, 0.04, 0.03], 0.15, 1, 6, 12)
    .superEllipsoid("bin_teal", [0.25, 0.39, -0.06], [0.03, 0.04, 0.03], 0.15, 1, 6, 12)
  builder.block(-width / 2, -depth / 2, width / 2, depth / 2)
}

/** A wayfinding totem facing +z: an LED bar and one stencilled line per destination. */
export function buildWayfinding(builder: FrameBuilder, item: OfficeItemOf<"wayfinding">): void {
  builder
    .box("steel_dark", [0, 0.02, 0], [0.7, 0.04, 0.3])
    .box("steel_dark", [0, 0.04 + 0.86, 0], [0.56, 1.72, 0.1])
    .box("led", [0, 1.7, 0.054], [0.4, 0.012, 0.004])
  ;(item.lines || []).forEach((line, index) => {
    wallStencil(builder, "floor_paint_light", line, 0, 1.5 - index * 0.17, 0.0545, 0.009)
  })
  builder.block(-0.35, -0.15, 0.35, 0.15)
}

/**
 * A plinth and glass case holding a freshly built robot (unpainted), with a plaque on the front.
 */
export function buildShowcase(builder: FrameBuilder, item: OfficeItemOf<"showcase">): void {
  const glass = builder.inNode("static-glass")
  const caseBottom = 0.6
  builder
    .box("steel_dark", [0, 0.015, 0], [0.66, 0.03, 0.66])
    .box("machine", [0, 0.305, 0], [0.6, 0.55, 0.6])
    .box("steel", [0, 0.59, 0], [0.62, 0.02, 0.62])
  glass.box("glass", [0, caseBottom + 0.3, 0], [0.56, 0.6, 0.56])
  builder.box("steel_dark", [0, 1.21, 0], [0.58, 0.02, 0.58])
  for (const legX of [-0.06, 0.06]) {
    builder.box("steel_dark", [legX, caseBottom + 0.055, 0], [0.07, 0.1, 0.09])
  }
  builder
    .box("shell", [0, caseBottom + 0.17, 0], [0.22, 0.14, 0.17])
    .superEllipsoid("shell", [0, caseBottom + 0.36, 0], [0.2, 0.14, 0.17], 0.3, 0.3, 6, 16)
  builder.box("screen_dark", [0, caseBottom + 0.36, 0.178], [0.28, 0.18, 0.02])
  for (const eyeX of [-0.06, 0.06]) {
    builder.box("led", [eyeX, caseBottom + 0.37, 0.192], [0.045, 0.06, 0.004])
  }
  builder
    .box("steel", [0, caseBottom + 0.53, 0], [0.016, 0.06, 0.016])
    .superEllipsoid("led", [0, caseBottom + 0.57, 0], [0.02, 0.02, 0.02], 1, 1, 4, 8)
  builder.box("furn_dark", [0, 0.45, 0.304], [0.32, 0.08, 0.008])
  wallStencil(builder, "floor_paint_light", item.label || "MODEL R1", 0, 0.45, 0.3125, 0.006)
  builder.block(-0.33, -0.33, 0.33, 0.33)
}
