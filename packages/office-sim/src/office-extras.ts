import { z } from "zod"
import { base64DecodedLength, isBase64 } from "./base64"

/** The most walk-grid cells a file may declare, so a malformed office cannot make us allocate without bound. */
export const MAX_WALK_GRID_CELLS = 4_000_000

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

const FloorPointSchema = z.tuple([z.number(), z.number()])

/**
 * The office walk grid as shipped in the scene extras: a `cols` x `rows` grid of `cell`-metre
 * squares starting at `origin` (x, z), one bit per cell (row-major, least significant bit first),
 * base64 encoded. Obstacles are already inflated by `inflate` metres.
 */
export const NavGridSchema = z
  .looseObject({
    origin: FloorPointSchema,
    cell: z.number().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    inflate: z.number().nonnegative(),
    bits: z.string(),
  })
  .superRefine((nav, context) => {
    const cellCount = nav.cols * nav.rows
    if (cellCount > MAX_WALK_GRID_CELLS) {
      context.addIssue({
        code: "custom",
        path: ["cols"],
        message: `the walk grid has ${cellCount} cells, more than the ${MAX_WALK_GRID_CELLS} allowed`,
      })
      return
    }
    const expectedBytes = Math.ceil(cellCount / 8)
    if (!isBase64(nav.bits) || base64DecodedLength(nav.bits) !== expectedBytes) {
      context.addIssue({
        code: "custom",
        path: ["bits"],
        message: `bits must be base64 for exactly ${expectedBytes} bytes (${nav.cols} x ${nav.rows} cells)`,
      })
    }
  })

/** A parsed walk grid description (see `NavGridSchema`). */
export type NavGrid = z.infer<typeof NavGridSchema>

/**
 * One way to fill an agent state: the POIs it may use (`poi-<kind>-*` wildcards allowed), the clip
 * looped there, and how a POI is picked: `own` = the agent's own `poi-<kind>-<desk>`, `position` =
 * the same by queue position, absent = the first free match.
 */
export const AgentStateSlotSchema = z.looseObject({
  pois: z.array(z.string().min(1)).min(1),
  clip: z.string().min(1),
  assign: z.enum(["own", "position"]).optional(),
})

/** A parsed agent-state slot (see `AgentStateSlotSchema`). */
export type AgentStateSlot = z.infer<typeof AgentStateSlotSchema>

/** One agent state: its status colour key and its slots, filled in order. */
export const AgentStateSchema = z.looseObject({
  note: z.string().optional(),
  color: z.string().min(1),
  slots: z.array(AgentStateSlotSchema).min(1),
})

/** A parsed agent state (see `AgentStateSchema`). */
export type AgentState = z.infer<typeof AgentStateSchema>

/**
 * Agent states by name. The shipped file also carries documentation strings beside the states
 * (`_format`); those are dropped, while a state that is an object of the wrong shape still fails.
 */
export const AgentStatesSchema = z
  .record(z.string(), z.union([AgentStateSchema, z.string()]))
  .transform((entries) => {
    const states: Record<string, AgentState> = {}
    for (const [name, entry] of Object.entries(entries)) {
      if (typeof entry !== "string") states[name] = entry
    }
    return states
  })

/** Agent states by name, documentation entries removed. */
export type AgentStates = z.infer<typeof AgentStatesSchema>

/** How status shows on the office: the status texture's size and the colour of each status key. */
export const StatusColorsSchema = z.looseObject({
  texture: z.string().min(1),
  width: z.number().int().positive(),
  desks: z.number().int().nonnegative(),
  materials: z.array(z.string().min(1)),
  colors: z.record(z.string(), z.string().regex(HEX_COLOUR)),
  off: z.string().regex(HEX_COLOUR),
})

/**
 * The scene extras of agent-office's `office.glb` that the simulation and the renderer read. The
 * file carries more (palette, screen atlas, conventions); those pass through unparsed. Every agent
 * state's colour must name a status colour, so a bad file fails here rather than mid-frame.
 */
export const OfficeExtrasSchema = z
  .looseObject({
    agents: z.looseObject({ max: z.number().int().positive() }),
    nav: NavGridSchema,
    approach: z.record(z.string(), FloorPointSchema),
    agentStates: AgentStatesSchema,
    statusColors: StatusColorsSchema,
  })
  .superRefine((extras, context) => {
    for (const [stateName, state] of Object.entries(extras.agentStates)) {
      if (!Object.hasOwn(extras.statusColors.colors, state.color)) {
        context.addIssue({
          code: "custom",
          path: ["agentStates", stateName, "color"],
          message: `"${state.color}" is not a key of statusColors.colors`,
        })
      }
    }
  })

/** The parsed office scene extras (see `OfficeExtrasSchema`). */
export type OfficeExtras = z.infer<typeof OfficeExtrasSchema>

/**
 * A point of interest read from an office node named `poi-<kind>-<id>`: where a robot stands or
 * sits, and the yaw it faces there (0 faces +z).
 */
export type OfficePoi = { name: string; x: number; z: number; yaw: number }
