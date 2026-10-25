import { readFileSync } from "node:fs"
import { z } from "zod"

const planPoint = z.tuple([z.number(), z.number()])
const worldPoint = z.tuple([z.number(), z.number(), z.number()])
/** `[x0, z0, x1, z1]` on the floor plan. */
const planRect = z.tuple([z.number(), z.number(), z.number(), z.number()])
const positiveInteger = z.number().int().positive()

/** The plant kinds a pot or a planter trough can hold. */
export const plantKindSchema = z.enum(["leafy", "snake", "grass", "fiddle", "olive"])

/** A plant kind name. */
export type PlantKind = z.infer<typeof plantKindSchema>

/**
 * Fields every item has: the zone it belongs to (its geometry merges into node `static-<zone>`),
 * its position on the plan and its turn about +y in degrees.
 */
const itemBase = {
  zone: z.string(),
  pos: planPoint,
  rot: z.number().optional(),
}

const chargeRowItem = z.object({
  type: z.literal("charge_row"),
  ...itemBase,
  dz: z.number(),
  plug: worldPoint,
  shuttles: z.array(positiveInteger).optional(),
  shuttleAmp: z.number().optional(),
  trayExtend: z.number().optional(),
})

const deskGridItem = z.object({
  type: z.literal("desk_grid"),
  ...itemBase,
  cols: positiveInteger,
  screens: z.array(z.array(z.string()).min(1)).min(1),
  colStep: planPoint.optional(),
  rowStep: planPoint.optional(),
  dx: z.number().optional(),
  dz: z.number().optional(),
})

const wallScreenItem = z.object({
  type: z.literal("wall_screen"),
  ...itemBase,
  size: planPoint,
  y: z.number(),
  screen: z.string().optional(),
  board: z.boolean().optional(),
  poi: z.object({ kind: z.string(), at: planPoint, rot: z.number() }).optional(),
})

const items = [
  chargeRowItem,
  z.object({ type: z.literal("cooling_unit"), ...itemBase }),
  z.object({ type: z.literal("plant"), ...itemBase, size: z.number().optional() }),
  deskGridItem,
  z.object({
    type: z.literal("planter_trough"),
    ...itemBase,
    length: z.number(),
    depth: z.number().optional(),
    height: z.number().optional(),
    kinds: z.array(plantKindSchema).min(1).optional(),
  }),
  wallScreenItem,
  z.object({
    type: z.literal("training_pod"),
    ...itemBase,
    id: positiveInteger,
    color: z.string().optional(),
    poiKind: z.string().optional(),
  }),
  z.object({
    type: z.literal("big_plant"),
    ...itemBase,
    kind: plantKindSchema,
    pot: z.string().optional(),
    size: z.number().optional(),
    r: z.number().optional(),
    h: z.number().optional(),
  }),
  z.object({ type: z.literal("service_bar"), ...itemBase }),
  z.object({
    type: z.literal("wall_clock"),
    ...itemBase,
    y: z.number().optional(),
    radius: z.number().optional(),
  }),
  z.object({ type: z.literal("bar_table"), ...itemBase }),
  z.object({ type: z.literal("launch_pad"), ...itemBase, radius: z.number() }),
  z.object({
    type: z.literal("guard_rail"),
    ...itemBase,
    length: z.number(),
    height: z.number().optional(),
  }),
  z.object({
    type: z.literal("conveyor"),
    ...itemBase,
    length: z.number(),
    spots: z.array(z.number()).optional(),
  }),
  z.object({ type: z.literal("workbench"), ...itemBase, id: positiveInteger }),
  z.object({ type: z.literal("shelving_rack"), ...itemBase, length: z.number().optional() }),
  z.object({ type: z.literal("pallet_stack"), ...itemBase }),
  z.object({
    type: z.literal("robot_arm"),
    ...itemBase,
    scale: z.number().optional(),
    swing: z.number().optional(),
    phase: z.number().optional(),
  }),
  z.object({
    type: z.literal("floor_hatch"),
    ...itemBase,
    rect: planRect,
    line: z.number().optional(),
    pitch: z.number().optional(),
  }),
  z.object({
    type: z.literal("floor_lines"),
    ...itemBase,
    rects: z.array(planRect),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal("floor_text"),
    ...itemBase,
    text: z.string(),
    px: z.number().optional(),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal("floor_arrows"),
    ...itemBase,
    xs: z.array(z.number()),
    size: z.number().optional(),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal("line_gantry"),
    ...itemBase,
    posts: z.array(z.number()).min(1),
    height: z.number().optional(),
    plates: z.array(z.number()).optional(),
  }),
  z.object({ type: z.literal("flash_station"), ...itemBase }),
  z.object({
    type: z.literal("data_link"),
    ...itemBase,
    from: planPoint,
    to: planPoint,
    fromFace: z.number(),
    y: z.number(),
    glassAt: z.number(),
    post: z.number().optional(),
  }),
  z.object({
    type: z.literal("control_room"),
    ...itemBase,
    angles: z.array(z.number()).min(1),
    ids: z.array(positiveInteger).min(1),
    radius: z.number().optional(),
    wall: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("scan_gate"),
    ...itemBase,
    width: z.number().optional(),
    text: z.string().optional(),
  }),
  z.object({ type: z.literal("round_rug"), ...itemBase, radius: z.number(), color: z.string() }),
  z.object({
    type: z.literal("seat_row"),
    ...itemBase,
    count: positiveInteger.optional(),
    spacing: z.number().optional(),
    shell: z.string().optional(),
    pois: z.record(z.string(), positiveInteger).optional(),
  }),
  z.object({ type: z.literal("low_table"), ...itemBase, size: planPoint.optional() }),
  z.object({ type: z.literal("wayfinding"), ...itemBase, lines: z.array(z.string()).optional() }),
  z.object({ type: z.literal("showcase"), ...itemBase, label: z.string().optional() }),
] as const

const officeItemSchema = z.discriminatedUnion("type", items)

/** One item of the office: `type` picks its builder, the other fields are that builder's. */
export type OfficeItem = z.infer<typeof officeItemSchema>

/** The item of one `type`. */
export type OfficeItemOf<Type extends OfficeItem["type"]> = Extract<OfficeItem, { type: Type }>

const wallNameSchema = z.enum(["north", "west", "south", "east"])

/** A wall of the room: north and west are full height, south and east are low cutaway walls. */
export type WallName = z.infer<typeof wallNameSchema>

const agentStateSlotSchema = z.object({
  pois: z.array(z.string()).min(1),
  clip: z.string(),
  assign: z.enum(["own", "position"]).optional(),
})

/**
 * An agent state: its note, its status colour (a `statusColors` key) and the slots an agent in it
 * takes, filled in order. Key order follows the layout, since the states are copied verbatim into
 * the scene extras.
 */
const agentStateSchema = z.object({
  note: z.string(),
  color: z.string(),
  slots: z.array(agentStateSlotSchema).min(1),
})

/** An agent state as the layout declares it. */
export type AgentState = z.infer<typeof agentStateSchema>

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/i)

/**
 * The office layout (`office-layout.json`): the room, its walls, openings, zones, glass, items,
 * spawns, idle areas, night lights and the agent-state mapping. Records (`statusColors`, `areas`,
 * `agentStates`) keep the layout's key order, which reaches the scene extras and the POI order.
 */
export const officeLayoutSchema = z
  .object({
    agents: z.object({ max: positiveInteger }),
    statusColors: z.record(z.string(), hexColour),
    room: z.object({
      x: planPoint,
      z: planPoint,
      wallHeight: z.number(),
      lowWallHeight: z.number(),
      wallThickness: z.number(),
      floor: z.string().optional(),
    }),
    doors: z.array(z.object({ wall: wallNameSchema, from: z.number(), to: z.number() })),
    windows: z.array(
      z.object({
        wall: wallNameSchema,
        from: z.number(),
        to: z.number(),
        sill: z.number(),
        top: z.number(),
      }),
    ),
    zones: z.array(
      z.object({
        id: z.string(),
        rect: planRect,
        floor: z.string().optional(),
        face: z.number().optional(),
      }),
    ),
    glass: z.array(
      z.object({
        from: planPoint,
        to: planPoint,
        pitch: z.number().optional(),
        doors: z.array(planPoint).optional(),
        door: planPoint.optional(),
      }),
    ),
    items: z.array(officeItemSchema),
    spawns: z.array(planPoint).min(1),
    spawnRot: z.number(),
    areas: z.record(z.string(), planPoint),
    nightLights: z.array(
      z.object({
        name: z.string(),
        pos: worldPoint,
        color: worldPoint,
        intensity: z.number(),
        range: z.number(),
      }),
    ),
    agentStates: z.record(z.string(), z.union([z.string(), agentStateSchema])),
  })
  .superRefine((layout, context) => {
    const zoneIds = new Set(layout.zones.map((zone) => zone.id))
    layout.items.forEach((item, index) => {
      if (!zoneIds.has(item.zone)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "zone"],
          message: `item ${item.type} is in zone ${item.zone}, which the layout does not declare`,
        })
      }
      if (item.type === "desk_grid" && item.colStep === undefined && item.dx === undefined) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "desk_grid needs colStep or dx",
        })
      }
      if (item.type === "desk_grid" && item.rowStep === undefined && item.dz === undefined) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "desk_grid needs rowStep or dz",
        })
      }
      if (item.type === "control_room" && item.ids.length !== item.angles.length) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "ids"],
          message: "control_room needs one sit_idle id per seat angle",
        })
      }
      if (item.type === "wall_screen" && !item.board && item.screen === undefined) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "wall_screen needs a screen unless it is the agent board",
        })
      }
    })
    for (const [stateName, state] of Object.entries(layout.agentStates)) {
      const isNote = stateName.startsWith("_")
      if (isNote !== (typeof state === "string")) {
        context.addIssue({
          code: "custom",
          path: ["agentStates", stateName],
          message: "agentStates keys starting with _ are notes (strings); the others are states",
        })
      }
      if (typeof state !== "string" && !Object.hasOwn(layout.statusColors, state.color)) {
        context.addIssue({
          code: "custom",
          path: ["agentStates", stateName, "color"],
          message: `colour ${state.color} is not a statusColors key`,
        })
      }
    }
  })

/** The parsed office layout. */
export type OfficeLayout = z.infer<typeof officeLayoutSchema>

/** One zone of the layout. */
export type OfficeZone = OfficeLayout["zones"][number]

/** Reads and validates a layout file; a malformed layout throws with every issue listed. */
export function readOfficeLayout(layoutPath: string): OfficeLayout {
  const parsed = officeLayoutSchema.safeParse(JSON.parse(readFileSync(layoutPath, "utf8")))
  if (!parsed.success) {
    throw new Error(`invalid office layout ${layoutPath}:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

/** The agent states of a layout without its `_`-prefixed notes, in layout order. */
export function agentStateEntries(layout: OfficeLayout): [string, AgentState][] {
  const entries: [string, AgentState][] = []
  for (const [stateName, state] of Object.entries(layout.agentStates)) {
    if (typeof state !== "string") entries.push([stateName, state])
  }
  return entries
}
