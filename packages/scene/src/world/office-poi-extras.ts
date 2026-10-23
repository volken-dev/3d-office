import { z } from "zod"

/**
 * What a point of interest in the office GLB is for. A spawn is where an agent stands when idle
 * and returns to when its work is done, a desk is where it sits to work, a seat is somewhere
 * anyone can sit down, and an area is a shared space agents gather in (the boardroom among them).
 */
export const OFFICE_POI_KINDS = ["spawn", "desk", "seat", "area"] as const
export type OfficePoiKind = (typeof OFFICE_POI_KINDS)[number]

/**
 * Spawns and desks belong to the agent whose index equals the slot; seats are just numbered.
 * Blender exports integer custom properties as JSON numbers.
 */
const PoiSlotSchema = z.number().int().nonnegative()

/** Area names become part of the POI id, so they stay lowercase and URL-safe. */
const PoiAreaSchema = z.string().regex(/^[a-z][a-z0-9_]*$/)

/**
 * The extras an empty node in the office GLB carries to be a point of interest (Blender custom
 * properties, which three exposes as `userData`). A node is a POI exactly when it has a `poi`
 * property; any other properties on it are ignored.
 */
export const OfficePoiExtrasSchema = z.discriminatedUnion("poi", [
  z.object({ poi: z.literal("spawn"), slot: PoiSlotSchema }),
  z.object({ poi: z.literal("desk"), slot: PoiSlotSchema }),
  z.object({ poi: z.literal("seat"), slot: PoiSlotSchema }),
  z.object({ poi: z.literal("area"), area: PoiAreaSchema }),
])
export type OfficePoiExtras = z.infer<typeof OfficePoiExtrasSchema>
