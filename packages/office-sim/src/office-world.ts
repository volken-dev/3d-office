import type { AgentId } from "./agent"
import type { AssetContract } from "./asset-contract"
import type { RobotBody } from "./avoidance"
import type { FloorPoint } from "./floor-point"
import type { AgentStates, OfficeExtras, OfficePoi } from "./office-extras"
import { ownEntry } from "./own-entry"
import { poiKind } from "./poi-slots"
import { decodeWalkGrid, type WalkGrid } from "./walk-grid"

/** The clips a robot plays to get into a POI (`enter`) and out of it (`exit`); empty = walk straight on. */
export interface PoiTransition {
  readonly enter?: readonly string[]
  readonly exit?: readonly string[]
}

/**
 * Everything agents share: the walk grid, the agent states, the POIs and which of them are held.
 * One world per office; every agent in it reserves POIs in the same `taken` set.
 */
export interface OfficeWorld {
  readonly grid: WalkGrid
  readonly agentStates: AgentStates
  readonly pois: ReadonlyMap<string, OfficePoi>
  readonly poiNames: readonly string[]
  /** POIs held by an agent, or reserved by anything else (for example a hand-placed robot). */
  readonly taken: Set<string>
  /** Where every robot in the office is and which way it walks, published by each agent every frame. */
  readonly bodies: Map<AgentId, RobotBody>
  /** The clips for entering and leaving a POI, from the contract's transitions. */
  transitionFor(poi: string): PoiTransition
  /** Where a robot walks to before entering a POI: its approach point, or the POI itself. */
  approachOf(poi: string): FloorPoint
  /** The POI with this name; throws for a name the office does not have. */
  poiNamed(poi: string): OfficePoi
}

const SEAT_KIND = /^(sit_|charge$)/

/**
 * Builds the shared world for an office from its parsed scene extras, its `poi-*` nodes and the
 * asset contract. A POI kind the contract does not list (a stale contract copy) is still treated
 * as a seat when it is named like one (`sit_*` or `charge`), as the reference does, so a robot
 * never plays a seated clip standing at an approach point.
 */
export function createOfficeWorld({
  extras,
  pois,
  contract,
}: {
  extras: OfficeExtras
  pois: readonly OfficePoi[]
  contract: AssetContract
}): OfficeWorld {
  const poisByName = new Map<string, OfficePoi>()
  for (const poi of pois) {
    if (poisByName.has(poi.name)) {
      throw new Error(`createOfficeWorld: POI "${poi.name}" appears twice`)
    }
    poisByName.set(poi.name, poi)
  }
  const { byPoiKind, byPoiPose } = contract.transitions

  function poseOf(kind: string): string {
    return ownEntry(contract.poses.poiKinds, kind) ?? (SEAT_KIND.test(kind) ? "sit" : "stand")
  }

  function poiNamed(poi: string): OfficePoi {
    const found = poisByName.get(poi)
    if (!found) throw new Error(`OfficeWorld: the office has no POI named "${poi}"`)
    return found
  }

  return {
    grid: decodeWalkGrid(extras.nav),
    agentStates: extras.agentStates,
    pois: poisByName,
    poiNames: pois.map((poi) => poi.name),
    taken: new Set(),
    bodies: new Map(),
    transitionFor(poi) {
      const kind = poiKind(poi)
      return ownEntry(byPoiKind, kind) ?? ownEntry(byPoiPose, poseOf(kind)) ?? {}
    },
    approachOf(poi) {
      const approach = ownEntry(extras.approach, poi)
      if (approach) return approach
      const { x, z } = poiNamed(poi)
      return [x, z]
    },
    poiNamed,
  }
}
