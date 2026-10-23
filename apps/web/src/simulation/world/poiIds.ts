import type { OfficePoiExtras } from "@the-delegation/shared/office-pois"

/**
 * The one place POI ids are built. PoiManager names every POI it parses with `poiIdFor`, and the
 * scene looks POIs up with the helpers below, so a lookup cannot drift from the parser (#21).
 */
export function poiIdFor(extras: OfficePoiExtras): string {
  return extras.poi === "area" ? `area-${extras.area}` : `${extras.poi}-${extras.slot}`
}

/** The desk that belongs to an agent. */
export function deskPoiId(agentIndex: number): string {
  return poiIdFor({ poi: "desk", slot: agentIndex })
}

/** Where an agent starts, and returns to when its work is done. */
export function spawnPoiId(agentIndex: number): string {
  return poiIdFor({ poi: "spawn", slot: agentIndex })
}

/** Where agents with an on-hold task meet. */
export const BOARDROOM_POI_ID = poiIdFor({ poi: "area", area: "boardroom" })
