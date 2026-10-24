import type { FrameBuilder } from "../frame-builder.ts"
import { nextInSequence } from "../office-build-context.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { wallStencil } from "../stencil-text.ts"
import type { Vector3 } from "../vector-math.ts"

/**
 * Rack LEDs: steady rows of blade lights on a metal strip, a random share lit cyan or warm. They
 * used to blink; the user read that as flicker, so they are static.
 */
function rackLeds(
  builder: FrameBuilder,
  bottom: number,
  top: number,
  z: number,
  halfWidth: number,
  rows: number,
): void {
  const random = builder.context.random
  for (let i = 0; i < rows; i++) {
    const y = bottom + ((i + 0.5) * (top - bottom)) / rows
    builder.quad("metal", [0, y, z], [halfWidth, 0, 0], [0, ((top - bottom) / rows) * 0.35, 0])
    for (let k = 0; k < 6; k++) {
      if (random() < 0.7) {
        builder.quad(
          random() < 0.75 ? "led" : "led_warm",
          [-halfWidth + 0.06 + k * 0.045, y, z + 0.006],
          [0.011, 0, 0],
          [0, 0.007, 0],
        )
      }
    }
  }
}

/**
 * One docking bay: the robot docks on the cradle facing +z and plugs into the rack behind it at
 * `plug`. Glass-door rack with LED blades, status strip and header and a floor ring in agent N's
 * status colour, a numbered bay plate on the rack top, the socket, the cradle (base plate,
 * pedestal with a light band, seat pad, side clamp arms) and a painted bay box. Front layers sit at
 * least 4 mm apart so nothing z-fights; the socket stands proud of the LED rows.
 */
function buildChargeBay(builder: FrameBuilder, id: number, plug: Vector3): void {
  const [plugX, plugY, plugZ] = plug
  const rackZ = plugZ - 0.3
  const statusMaterial = `status_glow#${id}`
  const glass = builder.inNode("static-glass")
  builder
    .box("furn_dark", [0, 0.97, rackZ], [1.16, 1.94, 0.6])
    .box("frame", [0, 0.97, plugZ + 0.005], [1.06, 1.84, 0.01])
  rackLeds(builder, 0.08, 1.75, plugZ + 0.018, 0.42, 11)
  builder
    .quad(statusMaterial, [-0.5, 1.0, plugZ + 0.016], [0.0175, 0, 0], [0, 0.8, 0])
    .quad(statusMaterial, [0, 1.9, plugZ + 0.016], [0.45, 0, 0], [0, 0.025, 0])
  glass.box("glass", [0.03, 1.33, plugZ + 0.075], [0.84, 0.98, 0.008])
  builder
    .box("steel_dark", [0.03, 1.84, plugZ + 0.075], [0.9, 0.03, 0.02])
    .box("steel_dark", [0.03, 0.82, plugZ + 0.075], [0.9, 0.03, 0.02])
  for (const x of [-0.4, 0.46])
    builder.box("steel_dark", [x, 1.33, plugZ + 0.075], [0.03, 1.0, 0.03])
  builder.box("steel", [0.38, 1.33, plugZ + 0.092], [0.02, 0.22, 0.014])
  builder
    .box("steel_dark", [0, 1.965, plugZ + 0.01], [0.05, 0.05, 0.04])
    .box("furn_dark", [0, 2.07, plugZ + 0.02], [0.34, 0.15, 0.02])
  wallStencil(
    builder,
    "floor_paint_light",
    String(id).padStart(2, "0"),
    0,
    2.07,
    plugZ + 0.0345,
    0.018,
  )
  builder.box("furn_dark", [plugX, plugY, plugZ + 0.036], [0.14, 0.14, 0.012])
  builder
    .superEllipsoid("led", [plugX, plugY, plugZ + 0.05], [0.06, 0.06, 0.003], 0.6, 0.6, 4, 16)
    .superEllipsoid(
      "furn_dark",
      [plugX, plugY, plugZ + 0.059],
      [0.04, 0.04, 0.003],
      0.6,
      0.6,
      4,
      16,
    )
  builder
    .superEllipsoid("steel_dark", [0, 0.02, 0], [0.3, 0.02, 0.27], 0.3, 0.45, 4, 24)
    .superEllipsoid("machine", [0, 0.17, 0], [0.27, 0.14, 0.24], 0.3, 0.35, 8, 20)
  builder
    .superEllipsoid("led", [0, 0.17, 0], [0.276, 0.01, 0.246], 0.3, 0.35, 4, 20)
    .superEllipsoid("steel_dark", [0, 0.322, 0.01], [0.24, 0.014, 0.2], 0.5, 0.4, 4, 18)
  for (const side of [-1, 1]) {
    builder
      .box("steel", [side * 0.41, 0.24, -0.14], [0.05, 0.48, 0.07])
      .box("steel", [side * 0.41, 0.5, -0.025], [0.06, 0.05, 0.29])
    builder
      .box("steel_dark", [side * 0.385, 0.5, 0.1], [0.03, 0.1, 0.07])
      .box("steel_dark", [side * 0.41, 0.01, -0.14], [0.1, 0.02, 0.12])
  }
  builder.superEllipsoid(statusMaterial, [0, 0.009, 0.02], [0.38, 0.003, 0.34], 0.3, 0.45, 4, 24)
  builder.outline("floor_paint", -0.55, -0.48, 0.55, 0.62, 0.05, 0.009)
  builder.block(-0.58, rackZ - 0.3, 0.58, plugZ).block(-0.44, -0.26, 0.44, 0.26)
  builder.pointOfInterest("charge", id, 0, 0, 0)
}

/**
 * Docking bays 1 to `agents.max`, spaced `dz` along the row's local x, then the cable tray along
 * the rack tops: coolant pipes at the back (into the cooling unit past bay 1, `trayExtend` further)
 * with a valve collar per rack, and rack-top shuttles (`anim-shuttle-N`) riding the front, which
 * slide back and forth along the tray in clip Ambient.
 */
export function buildChargeRow(builder: FrameBuilder, item: OfficeItemOf<"charge_row">): void {
  const context = builder.context
  const bayCount = context.layout.agents.max
  const spacing = item.dz
  const rackZ = item.plug[2] - 0.3
  const trayStart = 0.58 + (item.trayExtend || 0)
  const trayEnd = -(bayCount - 1) * spacing - 0.58
  for (let k = 0; k < bayCount; k++)
    buildChargeBay(builder.child(-k * spacing, 0, 0), k + 1, item.plug)
  builder
    .box("steel_dark", [(trayStart + trayEnd) / 2, 1.965, rackZ], [trayStart - trayEnd, 0.05, 0.56])
    .box(
      "steel",
      [(trayStart + trayEnd) / 2, 1.995, rackZ + 0.285],
      [trayStart - trayEnd - 0.02, 0.03, 0.02],
    )
  const pipes: [string, number][] = [
    ["steel", rackZ - 0.11],
    ["bin_teal", rackZ - 0.22],
  ]
  const pipeY = 2.03
  for (const [material, z] of pipes) {
    builder
      .tube(material, [trayStart - 0.04, pipeY, z], [trayEnd, pipeY, z], 0.03, 0.03, 8)
      .tube(material, [trayStart - 0.04, pipeY, z], [trayStart - 0.04, 1.9, z], 0.03, 0.03, 8)
      .superEllipsoid("steel_dark", [trayStart - 0.04, pipeY, z], [0.04, 0.04, 0.04], 1, 1, 5, 8)
    for (let k = 0; k < bayCount; k++) {
      builder.box("steel_dark", [-k * spacing + 0.35, pipeY, z], [0.05, 0.075, 0.075])
    }
  }
  for (const bay of item.shuttles || []) {
    const node = `anim-shuttle-${nextInSequence(context, "shuttle")}`
    const x = -(bay - 1) * spacing + 0.6
    const z = rackZ + 0.13
    context.animationPivots.set(node, builder.point([x, 0, z]))
    context.shuttleSlides.push({
      node,
      from: builder.point([x, 0, z]),
      direction: builder.direction([1, 0, 0]),
      amplitude: item.shuttleAmp || 0.45,
      phase: context.shuttleSlides.length * 0.37,
    })
    const shuttle = builder.inNode(node)
    shuttle
      .box("machine", [x, 2.06, z], [0.3, 0.1, 0.22])
      .box("steel_dark", [x, 2.118, z], [0.22, 0.016, 0.16])
      .box("led", [x, 2.06, z + 0.113], [0.18, 0.022, 0.004])
    for (const wheelX of [-0.1, 0.1]) {
      shuttle.box("steel_dark", [x + wheelX, 2.0, z], [0.06, 0.03, 0.2])
    }
    shuttle
      .box("steel_dark", [x, 2.0, z + 0.14], [0.03, 0.05, 0.06])
      .box("steel", [x, 1.97, z + 0.16], [0.07, 0.016, 0.03])
  }
}

/**
 * Where new robots' brains are flashed: a cabinet with a window on the camera side (+z) showing
 * memory modules glowing behind the glass, and a status panel. Its data tube (`data_link`) runs to
 * the fabricator.
 */
export function buildFlashStation(builder: FrameBuilder): void {
  builder
    .box("steel_dark", [0, 0.04, 0], [0.64, 0.08, 0.74])
    .box("machine", [0, 0.08 + 0.74, 0], [0.6, 1.48, 0.7])
    .box("steel", [0, 1.58, 0], [0.62, 0.04, 0.72])
  builder.box("screen_dark", [0, 0.95, 0.353], [0.4, 0.62, 0.006])
  for (let k = 0; k < 6; k++) {
    builder.box(
      "led",
      [-0.1 + (k % 3) * 0.1, 0.78 + Math.floor(k / 3) * 0.28, 0.358],
      [0.06, 0.14 + (k % 2) * 0.06, 0.004],
    )
  }
  builder
    .box("furn_dark", [0.12, 0.35, 0.356], [0.22, 0.14, 0.012])
    .box("led", [0.07, 0.35, 0.364], [0.03, 0.03, 0.004])
    .box("led_warm", [0.15, 0.35, 0.364], [0.03, 0.03, 0.004])
  builder.block(-0.32, -0.37, 0.32, 0.37)
}

/**
 * A glass tube along world x at height `y` from the flash station (`fromFace`) to the intake on the
 * fabricator's roof, with collars at the station, the glass wall (`glassAt`) and the intake, and an
 * optional support post. Glowing capsules (`anim-link`) slide one spacing per loop, capsule k
 * ending where k-1 started; the intake is long enough to hide a capsule's last spacing.
 */
export function buildDataLink(builder: FrameBuilder, item: OfficeItemOf<"data_link">): void {
  const context = builder.context
  const [startX, z] = item.from
  const [endX] = item.to
  const y = item.y
  const glass = builder.inNode("static-glass")
  const tubeStart = item.fromFace
  const capsuleCount = Math.max(2, Math.round((endX - startX) / 0.4))
  const spacing = (endX - startX) / capsuleCount
  const intakeLength = spacing + 0.25
  builder
    .box("machine", [endX - 0.13 + intakeLength / 2, 1.29 + 0.165, z], [intakeLength, 0.33, 0.24])
    .box("steel", [endX - 0.13 + intakeLength / 2, 1.635, z], [intakeLength + 0.02, 0.03, 0.26])
  glass.tube("glass", [tubeStart, y, z], [endX - 0.13, y, z], 0.065, 0.065, 12)
  const collars: [number, number][] = [
    [tubeStart + 0.03, 0.09],
    [item.glassAt, 0.1],
    [endX - 0.16, 0.09],
  ]
  for (const [collarX, radius] of collars) {
    builder.tube("steel_dark", [collarX - 0.03, y, z], [collarX + 0.03, y, z], radius, radius, 12)
  }
  if (item.post !== undefined) {
    builder
      .box("steel", [item.post, y / 2, z], [0.05, y - 0.07, 0.05])
      .box("steel_dark", [item.post, y - 0.04, z], [0.06, 0.04, 0.16])
      .box("steel_dark", [item.post, 0.006, z], [0.14, 0.012, 0.14])
      .block(item.post - 0.08, z - 0.08, item.post + 0.08, z + 0.08)
  }
  const node = "anim-link"
  context.animationPivots.set(node, builder.point([0, 0, 0]))
  context.slidingRows.push({
    node,
    from: builder.point([0, 0, 0]),
    to: builder.point([spacing, 0, 0]),
  })
  const capsules = builder.inNode(node)
  for (let k = 0; k <= capsuleCount; k++) {
    capsules.superEllipsoid("led", [endX - k * spacing, y, z], [0.055, 0.032, 0.032], 1, 1, 5, 8)
  }
}

/** A cooling (CRAC) unit against the wall at local z 0, front +z: louvres and a status panel. */
export function buildCoolingUnit(builder: FrameBuilder): void {
  builder
    .box("furn_light", [0, 0.95, 0.27], [1.5, 1.9, 0.54])
    .box("frame", [0, 1.88, 0.27], [1.52, 0.05, 0.56])
  for (let k = 0; k < 9; k++) builder.box("frame", [0, 0.25 + k * 0.13, 0.545], [1.3, 0.04, 0.012])
  builder
    .box("furn_dark", [0.45, 1.58, 0.545], [0.34, 0.16, 0.01])
    .box("led", [0.38, 1.6, 0.552], [0.12, 0.04, 0.004])
    .box("led_warm", [0.54, 1.6, 0.552], [0.06, 0.04, 0.004])
  builder.block(-0.75, 0, 0.75, 0.56)
}
