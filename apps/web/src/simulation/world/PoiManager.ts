import * as THREE from "three/webgpu"
import type { CharacterStateKey, PoiDef } from "../../types"
import { isCharacterStateKey } from "../behavior/CharacterStateMachine"

const POI_NAME_PATTERN = /^poi-([a-z0-9_]+)-(.+)$/

/**
 * Points of Interest: named locations that put an arriving agent into a specific
 * character state (e.g. 'sit_idle', 'sit_work'). Loaded from empties in the office GLB.
 */
export class PoiManager {
  private pois = new Map<string, PoiDef>()

  private addPoi(poi: PoiDef): void {
    this.pois.set(poi.id, { ...poi })
  }

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

  public getPoi(id: string): PoiDef | undefined {
    return this.pois.get(id)
  }

  /**
   * Returns all free POIs for a specific arrival state.
   * If agentIndex is provided, include the POIs already occupied by that agent.
   */
  public getFreePois(arrivalState: CharacterStateKey, agentIndex?: number): PoiDef[] {
    return Array.from(this.pois.values()).filter(
      (poi) =>
        poi.arrivalState === arrivalState &&
        (poi.occupiedBy === null || poi.occupiedBy === agentIndex),
    )
  }

  /** Returns all free POIs that start with a specific ID prefix (e.g. 'spawn', 'area'). */
  public getFreePoisByPrefix(prefix: string, agentIndex?: number): PoiDef[] {
    return Array.from(this.pois.values()).filter(
      (poi) =>
        poi.id.includes(prefix) && (poi.occupiedBy === null || poi.occupiedBy === agentIndex),
    )
  }

  /**
   * Extract POIs from a loaded GLB scene.
   * Convention: empty objects named "poi-<arrivalState>-<uniqueId>".
   * "spawn" and "area" aren't character states, so they arrive in 'idle'; an unknown state name
   * also falls back to 'idle' (with a warning) rather than reaching the state machine.
   *
   * Example: "poi-sit_idle-chair_01", "poi-sit_work-desk_02", "poi-spawn-A", "poi-area-lounge"
   */
  public loadFromGlb(scene: THREE.Object3D): void {
    scene.traverse((child) => {
      const match = child.name.match(POI_NAME_PATTERN)
      if (!match) return

      const type = match[1]
      const uniqueId = match[2]

      let arrivalState: CharacterStateKey = "idle"
      let label: string | undefined

      if (type !== "spawn" && type !== "area") {
        if (isCharacterStateKey(type)) {
          arrivalState = type
        } else {
          console.warn(`[PoiManager] Unknown POI state "${type}" on "${child.name}"; using idle`)
        }
        if (arrivalState === "sit_idle") {
          label = "Sit down"
        }
      }

      const id = `${type}-${uniqueId}`

      const worldPosition = new THREE.Vector3()
      const worldQuaternion = new THREE.Quaternion()
      child.getWorldPosition(worldPosition)
      child.getWorldQuaternion(worldQuaternion)

      this.addPoi({
        id,
        position: worldPosition,
        quaternion: worldQuaternion,
        arrivalState,
        occupiedBy: null,
        label,
      })
    })
  }

  /** Iterates POIs without allocating an array (for per-event hit tests). */
  public values(): IterableIterator<PoiDef> {
    return this.pois.values()
  }

  /**
   * Returns ALL POIs whose ID contains the given prefix, regardless of occupancy.
   * Results are sorted by ID for a consistent, repeatable order.
   */
  public getPoisByPrefix(prefix: string): PoiDef[] {
    return Array.from(this.pois.values())
      .filter((poi) => poi.id.includes(prefix))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}
