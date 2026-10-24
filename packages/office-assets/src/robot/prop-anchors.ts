import type { ReadonlyVector3 } from "./vector3.ts"

/** Where the charging cable leaves the battery on the robot's back (bind-pose world space). */
export const CABLE_ANCHOR: ReadonlyVector3 = [0.003, 0.45, -0.2]

/** The sleep letters' centre, right of the head. */
export const SLEEP_LETTERS_ANCHOR: ReadonlyVector3 = [0.36, 1.33, 0.0]

/** The "?" and "!" status glyphs: above-right of the head, clear of the antenna. */
export const STATUS_GLYPH_ANCHOR: ReadonlyVector3 = [0.3, 1.6, 0.0]

/**
 * The tool icons: above-left of the head, so a working agent can show a tool and a status glyph
 * at once.
 */
export const TOOL_ICON_ANCHOR: ReadonlyVector3 = [-0.26, 1.6, 0.0]

/** The antenna's base joint, on top of the head. */
export const ANTENNA_BASE: ReadonlyVector3 = [0.1, 1.245, -0.04]

/** The antenna's tip joint, partway up the mast. */
export const ANTENNA_MIDPOINT: ReadonlyVector3 = [0.1, 1.345, -0.04]
