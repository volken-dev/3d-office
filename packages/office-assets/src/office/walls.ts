import { FrameBuilder } from "./frame-builder.ts"
import type { OfficeLayout, WallName } from "./office-layout-schema.ts"

/**
 * One wall as a run along `axis` from `start` to `end`, between faces `faceMin` and `faceMax`
 * on the other axis, `height` tall. `capTrimStart` / `capTrimEnd` shorten its top cap where another
 * wall's cap covers the corner.
 */
interface WallRun {
  axis: "x" | "z"
  start: number
  end: number
  faceMin: number
  faceMax: number
  height: number
  capTrimStart?: number
  capTrimEnd?: number
}

/** A window or the door in a wall, as a gap from `from` to `to` and `sill` to `top`. */
interface WallOpening {
  from: number
  to: number
  sill: number
  top: number
  door: boolean
}

/**
 * The four walls. The overhead camera looks from +x/+z, so north and west are full height and
 * south and east are low cutaway walls. South starts at the west wall's inner face, so no end
 * faces are flush.
 */
function wallRuns(layout: OfficeLayout): [WallName, WallRun][] {
  const {
    x: [minX, maxX],
    z: [minZ, maxZ],
    wallHeight,
    lowWallHeight,
    wallThickness,
  } = layout.room
  return [
    [
      "north",
      {
        axis: "x",
        start: minX - wallThickness,
        end: maxX + wallThickness,
        faceMin: minZ - wallThickness,
        faceMax: minZ,
        height: wallHeight,
      },
    ],
    [
      "west",
      {
        axis: "z",
        start: minZ,
        end: maxZ + wallThickness,
        faceMin: minX - wallThickness,
        faceMax: minX,
        height: wallHeight,
        capTrimStart: 0.02,
      },
    ],
    [
      "south",
      {
        axis: "x",
        start: minX,
        end: maxX + wallThickness,
        faceMin: maxZ,
        faceMax: maxZ + wallThickness,
        height: lowWallHeight,
      },
    ],
    [
      "east",
      {
        axis: "z",
        start: minZ,
        end: maxZ,
        faceMin: maxX,
        faceMax: maxX + wallThickness,
        height: lowWallHeight,
        capTrimEnd: 0.02,
      },
    ],
  ]
}

/**
 * A box of wall material along a wall run, from `start` to `end` and `bottom` to `top`, centred on
 * the wall's thickness plus `inset`; `boxThickness` overrides the wall's own thickness. Degenerate
 * boxes (under 1 mm) are skipped.
 */
function wallBox(
  architecture: FrameBuilder,
  wall: WallRun,
  start: number,
  end: number,
  bottom: number,
  top: number,
  material = "wall",
  inset = 0,
  boxThickness: number | null = null,
): void {
  const middle = (start + end) / 2
  const length = end - start
  const faceMiddle = (wall.faceMin + wall.faceMax) / 2 + inset
  const faceThickness = boxThickness ?? wall.faceMax - wall.faceMin
  if (length <= 0.001 || top - bottom <= 0.001) return
  if (wall.axis === "x") {
    architecture.box(
      material,
      [middle, (bottom + top) / 2, faceMiddle],
      [length, top - bottom, faceThickness],
    )
  } else {
    architecture.box(
      material,
      [faceMiddle, (bottom + top) / 2, middle],
      [faceThickness, top - bottom, length],
    )
  }
}

/**
 * A window's frame (3 cm sill, head and jambs), mullions about every 0.7 m, an interior sill that
 * overhangs the jambs (no flush end faces) and the pane, in its own `static-glass` frame.
 */
function buildWindow(
  architecture: FrameBuilder,
  wall: WallRun,
  opening: WallOpening,
  interiorSign: number,
  thickness: number,
): void {
  const { from, to, sill, top } = opening
  const frameThickness = thickness + 0.02
  wallBox(architecture, wall, from, to, sill - 0.03, sill, "frame", 0, frameThickness)
  wallBox(architecture, wall, from, to, top, top + 0.03, "frame", 0, frameThickness)
  wallBox(
    architecture,
    wall,
    from - 0.03,
    from,
    sill - 0.03,
    top + 0.03,
    "frame",
    0,
    frameThickness,
  )
  wallBox(architecture, wall, to, to + 0.03, sill - 0.03, top + 0.03, "frame", 0, frameThickness)
  const panes = Math.max(1, Math.round((to - from) / 0.7))
  for (let k = 1; k < panes; k++) {
    const mullion = from + ((to - from) * k) / panes
    wallBox(
      architecture,
      wall,
      mullion - 0.015,
      mullion + 0.015,
      sill,
      top,
      "frame",
      0,
      thickness + 0.01,
    )
  }
  wallBox(
    architecture,
    wall,
    from - 0.045,
    to + 0.045,
    sill - 0.05,
    sill - 0.01,
    "wall_trim",
    interiorSign * 0.06,
    0.12,
  )
  const glass = new FrameBuilder(architecture.context, "static-glass")
  const middle = (from + to) / 2
  const faceMiddle = (wall.faceMin + wall.faceMax) / 2
  const length = to - from
  if (wall.axis === "x") {
    glass.box(
      "glass",
      [middle, (sill + top) / 2, faceMiddle],
      [length - 0.01, top - sill - 0.01, 0.01],
    )
  } else {
    glass.box(
      "glass",
      [faceMiddle, (sill + top) / 2, middle],
      [0.01, top - sill - 0.01, length - 0.01],
    )
  }
}

/**
 * Builds the walls into the architecture frame, each with its windows and door cut out. Around a
 * window the wall stops at the frame rather than overlapping into it, which would z-fight. The
 * door gets posts proud of the wall cap (thickness + 0.04) and a header between the posts, not
 * through them. Every wall gets a top cap; full-height walls get a skirting.
 */
export function buildWalls(architecture: FrameBuilder, layout: OfficeLayout): void {
  const thickness = layout.room.wallThickness
  for (const [name, wall] of wallRuns(layout)) {
    const openings: WallOpening[] = [
      ...layout.windows
        .filter((window) => window.wall === name)
        .map((window) => ({ ...window, door: false })),
      ...layout.doors
        .filter((door) => door.wall === name)
        .map((door) => ({ ...door, sill: 0, top: wall.height, door: true })),
    ].sort((a, b) => a.from - b.from)
    let cursor = wall.start
    const interiorSign = name === "north" || name === "west" ? 1 : -1
    for (const opening of openings) {
      const frameWidth = opening.door ? 0 : 0.03
      const gapStart = opening.from - frameWidth
      const gapEnd = opening.to + frameWidth
      wallBox(architecture, wall, cursor, gapStart, 0, wall.height)
      wallBox(architecture, wall, gapStart, gapEnd, 0, opening.sill - frameWidth)
      wallBox(architecture, wall, gapStart, gapEnd, opening.top + frameWidth, wall.height)
      cursor = gapEnd
      if (opening.door) {
        for (const post of [opening.from, opening.to]) {
          wallBox(
            architecture,
            wall,
            post - 0.05,
            post + 0.05,
            0,
            1.95,
            "frame",
            0,
            thickness + 0.07,
          )
        }
        wallBox(
          architecture,
          wall,
          opening.from + 0.05,
          opening.to - 0.05,
          1.85,
          1.95,
          "frame",
          0,
          thickness + 0.07,
        )
      } else {
        buildWindow(architecture, wall, opening, interiorSign, thickness)
      }
    }
    wallBox(architecture, wall, cursor, wall.end, 0, wall.height)
    wallBox(
      architecture,
      wall,
      wall.start + (wall.capTrimStart || 0),
      wall.end - (wall.capTrimEnd || 0),
      wall.height,
      wall.height + 0.05,
      "wall_cap",
      0,
      thickness + 0.04,
    )
    if (wall.height > 1) {
      wallBox(
        architecture,
        wall,
        wall.start + thickness,
        wall.end - thickness,
        0,
        0.08,
        "wall_trim",
        interiorSign * (thickness / 2 + 0.01),
        0.02,
      )
    }
  }
}
