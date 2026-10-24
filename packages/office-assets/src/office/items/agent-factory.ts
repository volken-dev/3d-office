import type { FrameBuilder } from "../frame-builder.ts"
import { nextInSequence } from "../office-build-context.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { wallStencil } from "../stencil-text.ts"
import type { Vector3 } from "../vector-math.ts"

/** The belt's height above the floor. */
const BELT_HEIGHT = 0.4

/**
 * The fabricator at the belt's +x end: a tall machine with a mouth onto the belt and a light bar,
 * a cap and print-head housing, and a window on the camera side (local -z) showing a half-built
 * robot (a head shell with its face screen off, and the arm building it), a control panel and vents.
 */
function buildFabricator(builder: FrameBuilder, centerX: number): void {
  const width = 0.8
  const depth = 1.0
  const height = 1.25
  const mouthX = -0.5 * width - 0.003
  const cameraSideZ = -depth / 2
  builder
    .box("steel_dark", [centerX, 0.04, 0], [width + 0.04, 0.08, depth + 0.04])
    .box("machine", [centerX, 0.08 + (height - 0.08) / 2, 0], [width, height - 0.08, depth])
  builder
    .box("steel", [centerX, height + 0.02, 0], [width + 0.02, 0.04, depth + 0.02])
    .box("machine", [centerX + 0.12, height + 0.12, 0.1], [0.34, 0.16, 0.5])
    .box("led", [centerX + 0.12, height + 0.12, -0.153], [0.24, 0.025, 0.006])
  builder
    .box("furn_dark", [centerX + mouthX, 0.6, 0], [0.006, 0.42, 0.56])
    .box("led", [centerX + mouthX - 0.008, 0.83, 0], [0.006, 0.03, 0.6])
  builder
    .box("screen_dark", [centerX, 0.78, cameraSideZ - 0.003], [0.56, 0.5, 0.006])
    .box("led", [centerX, 0.545, cameraSideZ - 0.009], [0.52, 0.02, 0.006])
  builder
    .box("shell", [centerX - 0.03, 0.87, cameraSideZ - 0.009], [0.26, 0.19, 0.006])
    .box("furn_dark", [centerX - 0.03, 0.87, cameraSideZ - 0.015], [0.2, 0.12, 0.006])
  builder
    .box("shell", [centerX - 0.03, 0.68, cameraSideZ - 0.009], [0.14, 0.13, 0.006])
    .box("steel", [centerX + 0.17, 1.0, cameraSideZ - 0.009], [0.03, 0.06, 0.006])
    .box("steel", [centerX + 0.17, 0.955, cameraSideZ - 0.015], [0.07, 0.03, 0.006])
  builder.box("furn_dark", [centerX - 0.22, 0.3, cameraSideZ - 0.006], [0.2, 0.16, 0.012])
  const panelLights: [number, string][] = [
    [-0.27, "led"],
    [-0.22, "led_warm"],
    [-0.17, "led"],
  ]
  for (const [offsetX, material] of panelLights) {
    builder.box(material, [centerX + offsetX, 0.33, cameraSideZ - 0.016], [0.028, 0.028, 0.004])
  }
  for (let k = 0; k < 5; k++) {
    builder.box(
      "steel_dark",
      [centerX + 0.2, 0.22 + k * 0.05, cameraSideZ - 0.005],
      [0.22, 0.016, 0.01],
    )
  }
}

/** Dispatch at the belt's -x end: a shutter mouth onto the belt, roller-door slats on the camera side. */
function buildDispatch(builder: FrameBuilder, centerX: number): void {
  const width = 0.7
  const depth = 0.8
  const height = 1.0
  const mouthX = 0.5 * width + 0.003
  builder
    .box("steel_dark", [centerX, 0.04, 0], [width + 0.04, 0.08, depth + 0.04])
    .box("machine", [centerX, 0.08 + (height - 0.08) / 2, 0], [width, height - 0.08, depth])
    .box("steel", [centerX, height + 0.02, 0], [width + 0.02, 0.04, depth + 0.02])
  builder
    .box("furn_dark", [centerX + mouthX, 0.58, 0], [0.006, 0.42, 0.56])
    .box("led_warm", [centerX + mouthX + 0.008, 0.81, 0], [0.006, 0.03, 0.6])
  for (let k = 0; k < 7; k++) {
    builder.box("steel", [centerX, 0.2 + k * 0.085, -depth / 2 - 0.004], [0.5, 0.06, 0.008])
  }
}

/**
 * The deploy line's belt along local x, from the fabricator (+x) to the dispatch chute (-x): a
 * steel frame (side channels, legs with cross braces) and a dark belt between guide rails. The
 * cargo is freshly built robots, unpainted (they get their colour when they start working); one
 * node (`anim-conveyor`) slides the row one spacing per loop toward dispatch, so robot k ends where
 * robot k+1 started: every slot holds the same thing, the loop is seamless, and the robot that
 * wraps round is hidden inside the machines. `spots` places ship POIs along the belt.
 */
export function buildConveyor(builder: FrameBuilder, item: OfficeItemOf<"conveyor">): void {
  const context = builder.context
  const length = item.length
  const height = BELT_HEIGHT
  builder
    .box("steel_dark", [0, height - 0.05, 0], [length - 0.06, 0.08, 0.56])
    .box("rug_mat", [0, height, 0], [length - 0.07, 0.012, 0.48])
  for (const z of [-0.28, 0.28]) {
    builder
      .box("steel", [0, height + 0.03, z], [length - 0.02, 0.05, 0.03])
      .box("steel_dark", [0, height + 0.065, z], [length - 0.02, 0.012, 0.012])
  }
  for (let x = -length / 2 + 0.15; x <= length / 2 - 0.1; x += 0.9) {
    for (const z of [-0.22, 0.22]) {
      builder
        .box("steel", [x, (height - 0.09) / 2, z], [0.05, height - 0.09, 0.05])
        .box("steel_dark", [x, 0.01, z], [0.09, 0.02, 0.09])
    }
    builder.box("steel_dark", [x, 0.12, 0], [0.03, 0.03, 0.39])
  }
  const fabricatorX = length / 2 + 0.4
  const dispatchX = -length / 2 - 0.35
  buildFabricator(builder, fabricatorX)
  buildDispatch(builder, dispatchX)
  builder
    .block(dispatchX - 0.37, -0.42, dispatchX + 0.37, 0.42)
    .block(fabricatorX - 0.42, -0.52, fabricatorX + 0.42, 0.52)
    .block(dispatchX, -0.4, fabricatorX, 0.3)
  const robotCount = Math.round((fabricatorX - dispatchX) / 0.85)
  const spacing = (fabricatorX - dispatchX) / robotCount
  const node = "anim-conveyor"
  context.animationPivots.set(node, builder.point([0, 0, 0]))
  context.slidingRows.push({
    node,
    from: builder.point([0, 0, 0]),
    to: builder.point([-spacing, 0, 0]),
  })
  const cargo = builder.inNode(node)
  const cameraSide = -1
  for (let k = 0; k <= robotCount; k++) {
    const centerX = fabricatorX - k * spacing
    for (const legX of [-0.035, 0.035]) {
      cargo.box("steel_dark", [centerX + legX, height + 0.04, 0], [0.04, 0.06, 0.05])
    }
    cargo
      .box("shell", [centerX, height + 0.11, 0], [0.13, 0.08, 0.1])
      .superEllipsoid("shell", [centerX, height + 0.22, 0], [0.12, 0.08, 0.1], 0.3, 0.3, 5, 12)
    cargo.box("screen_dark", [centerX, height + 0.22, cameraSide * 0.104], [0.17, 0.11, 0.012])
    for (const eyeX of [-0.035, 0.035]) {
      cargo.box("led", [centerX + eyeX, height + 0.225, cameraSide * 0.113], [0.026, 0.034, 0.004])
    }
    cargo
      .box("steel", [centerX, height + 0.33, 0], [0.012, 0.07, 0.012])
      .box("led", [centerX, height + 0.375, 0], [0.022, 0.022, 0.022])
  }
  for (const spotX of item.spots || []) builder.pointOfInterest("ship", null, spotX, -0.75, 0)
}

/** A flat glowing pad (walkable) where finished agents celebrate. */
export function buildLaunchPad(builder: FrameBuilder, item: OfficeItemOf<"launch_pad">): void {
  const radius = item.radius
  builder
    .superEllipsoid("furn_dark", [0, 0.008, 0], [radius, 0.005, radius], 0.2, 1, 4, 40)
    .superEllipsoid("led", [0, 0.017, 0], [radius * 0.9, 0.002, radius * 0.9], 0.2, 1, 4, 40)
    .superEllipsoid(
      "furn_dark",
      [0, 0.023, 0],
      [radius * 0.82, 0.002, radius * 0.82],
      0.2,
      1,
      4,
      40,
    )
  for (let k = 0; k < 8; k++) {
    builder.child(0, 0, k * 45).box("led_warm", [0, 0.029, radius * 0.62], [0.06, 0.004, 0.14])
  }
}

/** Wrapped crates on a pallet, by dispatch. */
export function buildPalletStack(builder: FrameBuilder): void {
  for (const x of [-0.5, 0, 0.5]) builder.box("pallet", [x * 0.76, 0.03, 0], [0.09, 0.06, 1.0])
  for (let k = 0; k < 5; k++) builder.box("pallet", [0, 0.075, -0.42 + k * 0.21], [1.2, 0.03, 0.12])
  const crates: [number, number, number, number][] = [
    [-0.3, 0.24, -0.25, 0.3],
    [0.3, 0.24, -0.25, 0.3],
    [-0.3, 0.24, 0.25, 0.3],
    [0.3, 0.24, 0.25, 0.3],
    [-0.3, 0.54, -0.25, 0.3],
  ]
  for (const [x, y, z, crateHeight] of crates) {
    builder
      .box("wood_furn", [x, y, z], [0.56, crateHeight, 0.46])
      .box("tape", [x, y, z], [0.57, 0.035, 0.47])
  }
  builder.block(-0.62, -0.52, 0.62, 0.52)
}

/** The parts tray's six parts, in order. */
const TRAY_PART_MATERIALS = ["metal", "bin_teal", "metal", "furn_light", "bin_navy", "metal"]

/**
 * A deploy station: the robot stands at the origin facing +z at a low bench (top 0.25 m) in front:
 * steel top with a brushed lip, a lower shelf of bins, the anvil plate where the Hammer clip's
 * strike lands, the gadget being built (an open case with a board and parts), a parts tray, a
 * screwdriver, a task lamp at the back corner (its arm starts inside the post), an anti-fatigue mat
 * under the robot and a painted station box (floor paint at y 0.009, clear of the mat). The
 * obstacle starts behind the front legs (z 0.19): the robot's toes go under the bench top.
 */
export function buildWorkbench(builder: FrameBuilder, item: OfficeItemOf<"workbench">): void {
  const top = 0.25
  builder
    .box("bench_top", [0, top - 0.015, 0.42], [1.1, 0.03, 0.48])
    .box("steel", [0, top - 0.015, 0.663], [1.1, 0.03, 0.006])
  for (const x of [-0.52, 0.52]) {
    for (const z of [0.21, 0.63]) {
      builder.box("steel_dark", [x, (top - 0.03) / 2, z], [0.035, top - 0.03, 0.035])
    }
  }
  builder.box("furn_dark", [0, 0.07, 0.42], [1.02, 0.02, 0.42])
  const bins: [string, number][] = [
    ["bin_navy", -0.3],
    ["bin_teal", 0.05],
    ["bin_sand", 0.35],
  ]
  for (const [material, x] of bins) builder.box(material, [x, 0.13, 0.44], [0.22, 0.1, 0.3])
  builder
    .box("furn_dark", [-0.31, top + 0.01, 0.33], [0.18, 0.02, 0.15])
    .box("metal", [-0.31, top + 0.025, 0.33], [0.12, 0.01, 0.09])
  builder
    .box("furn_light", [0.12, top + 0.05, 0.43], [0.22, 0.1, 0.18])
    .box("screen_dark", [0.12, top + 0.104, 0.43], [0.18, 0.004, 0.14])
  builder.box("pcb", [0.12, top + 0.112, 0.43], [0.15, 0.006, 0.11])
  const components: [number, number, string][] = [
    [0.07, 0.4, "metal"],
    [0.14, 0.46, "led"],
    [0.17, 0.4, "furn_dark"],
    [0.1, 0.47, "metal"],
  ]
  for (const [x, z, material] of components) {
    builder.box(material, [x, top + 0.12, z], [0.025, 0.012, 0.025])
  }
  builder.box("furn_dark", [0.4, top + 0.012, 0.3], [0.18, 0.024, 0.12])
  for (let k = 0; k < 6; k++) {
    builder.superEllipsoid(
      TRAY_PART_MATERIALS[k],
      [0.34 + (k % 3) * 0.055, top + 0.03, 0.28 + Math.floor(k / 3) * 0.045],
      [0.014, 0.01, 0.014],
      0.6,
      1,
      4,
      8,
    )
  }
  builder
    .box("metal", [0.43, top + 0.006, 0.5], [0.16, 0.012, 0.025])
    .superEllipsoid("furn_dark", [0.35, top + 0.012, 0.5], [0.025, 0.012, 0.02], 0.5, 1, 4, 8)
  builder
    .superEllipsoid("furn_dark", [-0.46, top + 0.01, 0.6], [0.06, 0.01, 0.06], 0.3, 1, 4, 14)
    .box("metal", [-0.46, top + 0.2, 0.6], [0.018, 0.38, 0.018])
    .box("metal", [-0.37, top + 0.395, 0.6], [0.17, 0.014, 0.008])
  builder
    .superEllipsoid("furn_dark", [-0.3, top + 0.36, 0.6], [0.06, 0.035, 0.06], 0.4, 1, 6, 14)
    .superEllipsoid("lamp_glow", [-0.3, top + 0.325, 0.6], [0.045, 0.004, 0.045], 0.5, 1, 4, 12)
  builder.quad("rug_mat", [0, 0.009, -0.06], [0.56, 0, 0], [0, 0, -0.32])
  builder.outline("floor_paint", -0.63, -0.55, 0.63, 0.72, 0.05, 0.009)
  builder.block(-0.56, 0.26, 0.56, 0.66)
  builder.pointOfInterest("ship", item.id, 0, 0, 0)
}

const SHELF_BIN_MATERIALS = ["bin_navy", "bin_teal", "bin_sand", "furn_light"]

/**
 * Industrial parts shelving, open both sides, along local x: four shelves, the lower three with a
 * random scatter of labelled bins.
 */
export function buildShelvingRack(
  builder: FrameBuilder,
  item: OfficeItemOf<"shelving_rack">,
): void {
  const random = builder.context.random
  const length = item.length || 1.6
  const depth = 0.5
  const height = 1.5
  for (const x of [-length / 2, length / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      builder.box("furn_dark", [x, height / 2, z], [0.04, height, 0.04])
    }
  }
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.12 + shelf * 0.42
    builder.box("metal", [0, y, 0], [length, 0.025, depth])
    if (shelf < 3) {
      for (let x = -length / 2 + 0.2, i = 0; x < length / 2 - 0.15; x += 0.3, i++) {
        if (random() < 0.85) {
          const material = SHELF_BIN_MATERIALS[(shelf + i) % SHELF_BIN_MATERIALS.length]
          builder
            .box(material, [x, y + 0.08, 0], [0.24, 0.14, 0.36])
            .box("furn_light", [x, y + 0.11, 0.1835], [0.1, 0.03, 0.006])
        }
      }
    }
  }
  builder.block(-length / 2 - 0.03, -depth / 2 - 0.03, length / 2 + 0.03, depth / 2 + 0.03)
}

/** A steel safety rail along local x: posts on base plates about every 1.2 m, two rails, a kick plate. */
export function buildGuardRail(builder: FrameBuilder, item: OfficeItemOf<"guard_rail">): void {
  const length = item.length
  const height = item.height || 0.55
  const spans = Math.max(1, Math.round(length / 1.2))
  for (let k = 0; k <= spans; k++) {
    const x = -length / 2 + (k * length) / spans
    builder
      .box("steel_dark", [x, 0.006, 0], [0.12, 0.012, 0.12])
      .box("steel", [x, 0.012 + height / 2, 0], [0.05, height, 0.05])
      .box("steel_dark", [x, height + 0.022, 0], [0.065, 0.02, 0.065])
  }
  builder
    .box("steel", [0, height - 0.02, 0], [length, 0.04, 0.035])
    .box("steel", [0, height * 0.55, 0], [length, 0.03, 0.03])
    .box("steel_dark", [0, 0.09, 0], [length, 0.1, 0.014])
  builder.block(-length / 2 - 0.06, -0.06, length / 2 + 0.06, 0.06)
}

/**
 * An industrial arm on a pedestal reaching toward local +z: shoulder, upper arm, elbow, forearm
 * with a muted accent band, wrist and gripper fingers. The turret (`anim-arm-N`) swings `swing`
 * degrees out and back once per loop of clip Ambient, offset by `phase`.
 */
export function buildRobotArm(builder: FrameBuilder, item: OfficeItemOf<"robot_arm">): void {
  const context = builder.context
  const pedestalScale = item.scale || 1
  builder
    .superEllipsoid(
      "steel_dark",
      [0, 0.04 * pedestalScale, 0],
      [0.2 * pedestalScale, 0.04 * pedestalScale, 0.2 * pedestalScale],
      0.3,
      1,
      4,
      20,
    )
    .superEllipsoid(
      "machine",
      [0, 0.22 * pedestalScale, 0],
      [0.13 * pedestalScale, 0.15 * pedestalScale, 0.13 * pedestalScale],
      0.2,
      1,
      6,
      18,
    )
  const node = `anim-arm-${nextInSequence(context, "arm")}`
  context.animationPivots.set(node, builder.point([0, 0, 0]))
  context.armSwings.push({ node, amplitude: item.swing ?? 35, phase: item.phase || 0 })
  const scale = item.scale || 1
  const scaled = (vector: Vector3): Vector3 => [
    vector[0] * scale,
    vector[1] * scale,
    vector[2] * scale,
  ]
  const arm = builder.inNode(node)
  const shoulder = scaled([0, 0.5, 0])
  const elbow = scaled([0, 0.86, 0.2])
  const wrist = scaled([0, 0.66, 0.56])
  arm
    .superEllipsoid("steel_dark", scaled([0, 0.39, 0]), scaled([0.12, 0.03, 0.12]), 0.3, 1, 4, 18)
    .superEllipsoid("machine", scaled([0, 0.47, 0]), scaled([0.11, 0.08, 0.13]), 0.4, 0.5, 6, 14)
  arm
    .superEllipsoid("steel_dark", shoulder, scaled([0.075, 0.075, 0.075]), 1, 1, 6, 12)
    .tube("machine", shoulder, elbow, 0.06 * scale, 0.05 * scale, 10)
    .superEllipsoid("steel_dark", elbow, scaled([0.06, 0.06, 0.06]), 1, 1, 6, 12)
  arm
    .tube("machine", elbow, wrist, 0.045 * scale, 0.04 * scale, 10)
    .superEllipsoid("bin_teal", scaled([0, 0.775, 0.36]), scaled([0.05, 0.05, 0.05]), 1, 1, 5, 10)
  arm
    .superEllipsoid("steel_dark", wrist, scaled([0.045, 0.045, 0.045]), 1, 1, 6, 12)
    .box("steel_dark", scaled([0, 0.6, 0.56]), scaled([0.1, 0.03, 0.06]))
  for (const x of [-0.035, 0.035]) {
    arm.box("steel", scaled([x, 0.545, 0.56]), scaled([0.016, 0.08, 0.035]))
  }
  builder.block(-0.2 * scale, -0.2 * scale, 0.2 * scale, 0.2 * scale)
}

/**
 * A steel portal along local x behind the workbenches: posts at `posts`, a beam, a task light under
 * it (`lamp_glow`, on at night) and hanging station plates at `plates`, numbered like the benches.
 */
export function buildLineGantry(builder: FrameBuilder, item: OfficeItemOf<"line_gantry">): void {
  const height = item.height || 1.85
  const posts = item.posts
  const beamStart = Math.min(...posts) - 0.06
  const beamEnd = Math.max(...posts) + 0.06
  for (const x of posts) {
    builder
      .box("steel_dark", [x, 0.006, 0], [0.16, 0.012, 0.16])
      .box("steel", [x, 0.012 + (height - 0.012) / 2, 0], [0.07, height - 0.012, 0.07])
    builder.block(x - 0.08, -0.08, x + 0.08, 0.08)
  }
  builder
    .box("steel", [(beamStart + beamEnd) / 2, height + 0.05, 0], [beamEnd - beamStart, 0.1, 0.12])
    .box(
      "steel_dark",
      [(beamStart + beamEnd) / 2, height + 0.106, 0],
      [beamEnd - beamStart + 0.02, 0.012, 0.13],
    )
  builder.box(
    "lamp_glow",
    [(beamStart + beamEnd) / 2, height - 0.012, 0.02],
    [beamEnd - beamStart - 0.2, 0.012, 0.05],
  )
  ;(item.plates || []).forEach((x, index) => {
    for (const offsetX of [-0.1, 0.1]) {
      builder.box("steel_dark", [x + offsetX, height - 0.08, 0.03], [0.012, 0.16, 0.012])
    }
    builder.box("furn_dark", [x, height - 0.24, 0.04], [0.32, 0.17, 0.02])
    wallStencil(
      builder,
      "floor_paint_light",
      String(index + 1).padStart(2, "0"),
      x,
      height - 0.24,
      0.0545,
      0.018,
    )
  })
}
