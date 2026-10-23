import * as THREE from "three/webgpu"
import type { CharacterStateKey, PoiDef } from "../../types"
import { OfficePoiExtrasSchema, type OfficePoiKind } from "./office-poi-extras"
import { poiIdFor } from "./poi-ids"

/** The state an agent enters on arriving at each kind of POI. */
const ARRIVAL_STATE_BY_KIND: Record<OfficePoiKind, CharacterStateKey> = {
  spawn: "idle",
  desk: "sit_work",
  seat: "sit_idle",
  area: "idle",
}

/** Only seats are offered to the player on hover. */
const LABEL_BY_KIND: Partial<Record<OfficePoiKind, string>> = { seat: "Sit down" }

/** Orders POIs by id with numbers compared by value, so `spawn-10` comes after `spawn-2`. */
function compareById(a: PoiDef, b: PoiDef): number {
  return a.id.localeCompare(b.id, "en", { numeric: true })
}

/**
 * Points of Interest: places in the office an agent walks to, and the character state it enters
 * on arrival. Read from the extras of empty nodes in the office GLB (see `OfficePoiExtrasSchema`).
 */
export class PoiManager {
  private pois = new Map<string, PoiDef>()

  /** Mark a POI as occupied by an agent. */
  public occupy(id: string, agentIndex: number): void {
    const poi = this.pois.get(id)
    if (poi) poi.occupiedBy = agentIndex
  }

  /** Release all POIs held by a specific agent. */
  public releaseAll(agentIndex: number): void {
    for (const poi of this.pois.values()) {
      if (poi.occupiedBy === agentIndex) poi.occupiedBy = null
    }
  }

  /** Looks a POI up by an id from `poi-ids.ts`. */
  public getPoi(id: string): PoiDef | undefined {
    return this.pois.get(id)
  }

  /** Every POI of a kind, regardless of occupancy, in id order. */
  public getPoisOfKind(kind: OfficePoiKind): PoiDef[] {
    return Array.from(this.pois.values())
      .filter((poi) => poi.kind === kind)
      .sort(compareById)
  }

  /** The POIs of a kind that are free, or already held by `agentIndex` when given, in id order. */
  public getFreePoisOfKind(kind: OfficePoiKind, agentIndex?: number): PoiDef[] {
    return this.getPoisOfKind(kind).filter(
      (poi) => poi.occupiedBy === null || poi.occupiedBy === agentIndex,
    )
  }

  /**
   * Reads the POIs from a loaded office scene. A node is a POI when its extras (three's
   * `userData`) have a `poi` property; the rest of those extras must match
   * `OfficePoiExtrasSchema`, or loading throws, naming the node, rather than leaving an agent
   * with nowhere to go.
   */
  public loadFromGlb(scene: THREE.Object3D): void {
    scene.traverse((node) => {
      if (node.userData.poi === undefined) return

      const parsed = OfficePoiExtrasSchema.safeParse(node.userData)
      if (!parsed.success) {
        throw new Error(
          `[PoiManager] Invalid POI extras on "${node.name}": ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "extras"}: ${issue.message}`)
            .join("; ")}`,
        )
      }

      const extras = parsed.data
      const id = poiIdFor(extras)
      if (this.pois.has(id)) throw new Error(`[PoiManager] Duplicate POI "${id}" on "${node.name}"`)

      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      node.getWorldPosition(position)
      node.getWorldQuaternion(quaternion)

      this.pois.set(id, {
        id,
        kind: extras.poi,
        position,
        quaternion,
        arrivalState: ARRIVAL_STATE_BY_KIND[extras.poi],
        occupiedBy: null,
        label: LABEL_BY_KIND[extras.poi],
      })
    })
  }

  /** Iterates POIs without allocating an array (for per-event hit tests). */
  public values(): IterableIterator<PoiDef> {
    return this.pois.values()
  }
}
