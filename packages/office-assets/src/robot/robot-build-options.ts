import { z } from "zod"
import { DEFAULT_PALETTE, MATERIAL_NAMES, type Palette } from "./material-palette.ts"

/** What a robot build varies on. */
export interface RobotBuildOptions {
  /** Build robot-lite, the crowd LOD. */
  lite: boolean
  /** Segment-count multiplier: 0.7 by default, 0.3 for lite. */
  meshDensity: number
  palette: Palette
  /** The source rig, when overridden; the build script supplies the default. */
  rigPath: string | undefined
}

/** A colour as `#RRGGBB` (the `#` optional) or a `0xRRGGBB` number. */
const hexColor = z.union([
  z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/, "a colour is #RRGGBB")
    .transform((value) => Number.parseInt(value.replace("#", ""), 16)),
  z.number().int().min(0).max(0xffffff),
])

/** Palette overrides: material name to colour. An unknown material name is an error. */
const paletteOverride = z.partialRecord(z.enum(MATERIAL_NAMES), hexColor)

/** The environment variables the robot build reads. Empty values count as unset. */
const robotEnvironment = z.object({
  LITE: z.enum(["0", "1"]).optional(),
  Q: z.coerce.number().positive().optional(),
  PAL_JSON: z.string().optional(),
  OFFICE_RIG: z.string().min(1).optional(),
})

/**
 * Reads the robot build's options from the environment: `LITE=1` builds robot-lite, `Q` sets the
 * mesh density, `PAL_JSON` overrides palette colours (for example `{"primary":"#46c27a"}`) and
 * `OFFICE_RIG` points at another source rig. Throws on malformed values.
 */
export function parseRobotBuildOptions(environment: NodeJS.ProcessEnv): RobotBuildOptions {
  const parsed = robotEnvironment.parse({
    LITE: environment.LITE || undefined,
    Q: environment.Q || undefined,
    PAL_JSON: environment.PAL_JSON || undefined,
    OFFICE_RIG: environment.OFFICE_RIG || undefined,
  })
  const lite = parsed.LITE === "1"
  const palette: Palette = { ...DEFAULT_PALETTE }
  if (parsed.PAL_JSON) {
    const override = paletteOverride.parse(JSON.parse(parsed.PAL_JSON))
    for (const name of MATERIAL_NAMES) {
      const color = override[name]
      if (color !== undefined) palette[name] = color
    }
  }
  return {
    lite,
    meshDensity: parsed.Q ?? (lite ? 0.3 : 0.7),
    palette,
    rigPath: parsed.OFFICE_RIG,
  }
}
