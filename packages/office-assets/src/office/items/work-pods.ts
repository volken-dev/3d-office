import { DESK_ITEMS } from "../desk-items.ts"
import { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItemOf } from "../office-layout-schema.ts"
import { cockpitSeat } from "../seats.ts"
import { wallStencil } from "../stencil-text.ts"
import { degreesToRadians, type Vector2, type Vector3 } from "../vector-math.ts"

/** One work pod in a continuous console row. */
interface ConsoleStation {
  id: number
  screen: string
  /** The pod's width along the row: the column step's length. */
  width: number
  /** The first pod of a row gets wings on both sides; the others only on `wingSide`. */
  first: boolean
  /** Which side (local x sign) the neighbour that shares this pod's wing is on. */
  wingSide: number
}

/** The data umbilical's path: a port on the seat back, down behind the seat, along the floor, up. */
const UMBILICAL_PATH: Vector3[] = [
  [0, 0.55, 0.38],
  [0, 0.12, 0.46],
  [-0.48, 0.035, 0.42],
  [-0.48, 0.035, -0.72],
  [-0.48, 0.3, -0.76],
]

/** The pod's footprint round the seat (local x +-0.7, z -0.9 to +0.45), checked against its zone. */
const POD_FOOTPRINT: Vector2[] = [
  [-0.7, -0.9],
  [0.7, -0.9],
  [0.7, 0.45],
  [-0.7, 0.45],
]

/**
 * A work pod: the robot sits at the origin facing -z, the console in -z. Console top (abutting its
 * neighbours) with a brushed front edge and a status line in the pod's own status colour, a cable
 * spine, frosted wings at the pod boundaries, a curved frameless screen on an arm with a shell
 * behind it, a keyboard, the numbered plate, one desk item, the cockpit seat with a data umbilical
 * (so a seated robot reads as plugged in) and a status ring on the floor round the seat.
 */
function buildConsoleStation(builder: FrameBuilder, station: ConsoleStation): void {
  const width = station.width
  const statusMaterial = `status_glow#${station.id}`
  const glass = builder.inNode("static-glass")
  builder
    .box("machine", [0, 0.48, -0.52], [width, 0.04, 0.7])
    .box("steel", [0, 0.48, -0.163], [width, 0.04, 0.014])
  builder.box(statusMaterial, [0, 0.47, -0.154], [width - 0.16, 0.012, 0.004])
  builder.box("steel_dark", [0, 0.33, -0.8], [width, 0.1, 0.14])
  for (const side of station.first ? [-1, 1] : [station.wingSide]) {
    const x = (side * width) / 2
    builder.box("steel_dark", [x, 0.23, -0.52], [0.06, 0.46, 0.55])
    glass.box("frosted", [x, 0.48, -0.31], [0.014, 0.84, 1.1])
    builder
      .box("steel", [x, 0.906, -0.31], [0.024, 0.012, 1.12])
      .box("steel", [x, 0.45, 0.255], [0.03, 0.9, 0.03])
  }
  builder
    .curved(`screen_${station.screen}`, [0, 0.8, -0.66], 0.8, 0.32, 1.0, 8, "static-screens")
    .curved("furn_dark", [0, 0.8, -0.66], 0.8, 0.32, 1.0, 8, builder.node, 0.012)
  builder
    .box("steel", [0, 0.6, -0.69], [0.03, 0.18, 0.03])
    .box("steel_dark", [0, 0.506, -0.69], [0.16, 0.012, 0.1])
  builder
    .box("steel_dark", [0, 0.508, -0.32], [0.38, 0.016, 0.12])
    .box("machine", [0, 0.518, -0.32], [0.35, 0.005, 0.1])
  builder.box("furn_dark", [-0.5, 0.535, -0.22], [0.16, 0.07, 0.012])
  wallStencil(
    builder,
    "floor_paint_light",
    String(station.id).padStart(2, "0"),
    -0.5,
    0.535,
    -0.2095,
    0.008,
  )
  DESK_ITEMS[(station.id - 1) % DESK_ITEMS.length](builder)
  cockpitSeat(builder.child(0, 0, 180))
  builder
    .box("furn_dark", [0, 0.6, 0.36], [0.1, 0.1, 0.03])
    .box("led", [0, 0.6, 0.377], [0.05, 0.02, 0.004])
  for (let k = 0; k < UMBILICAL_PATH.length - 1; k++) {
    builder.tube("steel_dark", UMBILICAL_PATH[k], UMBILICAL_PATH[k + 1], 0.022, 0.022, 6)
  }
  for (const bend of UMBILICAL_PATH.slice(1, -1)) {
    builder.superEllipsoid("steel_dark", bend, [0.024, 0.024, 0.024], 1, 1, 4, 8)
  }
  builder.ring(statusMaterial, 0.38, 0.44, 0.008, 0.011, 0, 360, 32)
  builder.block(-width / 2, -0.9, width / 2, -0.15)
  builder.pointOfInterest("sit_work", station.id, 0, 0, 180)
}

/**
 * Work pods 1 to `agents.max`, row-major from `pos` (pod 1): `colStep` / `rowStep` `[dx, dz]` (or
 * the scalars `dx` / `dz`), all turned by `rot`. Throws if a pod doesn't fit its zone.
 */
export function buildDeskGrid(builder: FrameBuilder, item: OfficeItemOf<"desk_grid">): void {
  const layout = builder.context.layout
  const podCount = layout.agents.max
  const rows = Math.ceil(podCount / item.cols)
  const zone = layout.zones.find((candidate) => candidate.id === item.zone)
  if (zone === undefined) throw new Error(`desk_grid: no zone ${item.zone}`)
  const zoneRect = zone.rect
  const columnStep = item.colStep || [requireStep(item.dx, "dx"), 0]
  const rowStep = item.rowStep || [0, requireStep(item.dz, "dz")]
  const cosine = Math.cos(degreesToRadians(item.rot || 0))
  const sine = Math.sin(degreesToRadians(item.rot || 0))
  for (let k = 0; k < podCount; k++) {
    const column = k % item.cols
    const row = Math.floor(k / item.cols)
    const x = item.pos[0] + column * columnStep[0] + row * rowStep[0]
    const z = item.pos[1] + column * columnStep[1] + row * rowStep[1]
    const footprint = POD_FOOTPRINT.map(([localX, localZ]) => [
      x + localX * cosine + localZ * sine,
      z - localX * sine + localZ * cosine,
    ])
    if (
      footprint.some(
        ([footX, footZ]) =>
          footX < zoneRect[0] || footX > zoneRect[2] || footZ < zoneRect[1] || footZ > zoneRect[3],
      )
    ) {
      throw new Error(
        `desk_grid: desk ${k + 1} of ${podCount} (${rows} rows x ${item.cols}) at [${x.toFixed(2)}, ${z.toFixed(2)}] doesn't fit zone ${item.zone}; widen the room/zone or change cols/steps`,
      )
    }
    const podBuilder = new FrameBuilder(builder.context, builder.node, x, z, item.rot || 0)
    const screens = item.screens[k % item.screens.length]
    buildConsoleStation(podBuilder, {
      id: k + 1,
      screen: screens[0],
      width: Math.hypot(...columnStep),
      first: column === 0,
      wingSide: Math.sign(columnStep[0] * cosine - columnStep[1] * sine) || 1,
    })
  }
}

function requireStep(step: number | undefined, name: string): number {
  if (step === undefined) throw new Error(`desk_grid needs ${name} when its step vector is absent`)
  return step
}
