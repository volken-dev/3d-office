import type * as THREE from "three/webgpu"
import { Pathfinding } from "three-pathfinding"
import { NAVMESH_ZONE } from "../constants"

/** Navigation mesh for path queries, built from the navmesh geometry in the office GLB. */
export class NavMeshManager {
  private pathfinding = new Pathfinding()
  private ready = false

  /**
   * Load a navmesh from any BufferGeometry (e.g. extracted from a GLB).
   * Replaces any previously loaded zone.
   */
  public loadFromGeometry(geometry: THREE.BufferGeometry): void {
    const zone = Pathfinding.createZone(geometry)
    this.pathfinding.setZoneData(NAVMESH_ZONE, zone)
    this.ready = true
  }

  /**
   * Find a path from `from` to `to`.
   * Returns the waypoints (excluding the start position), or [] when the navmesh
   * is not ready or `from` is off the mesh. three-pathfinding's typings say getGroup and findPath
   * always return values, but at runtime they return null off the mesh, hence the checks.
   */
  public findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    if (!this.ready) return []

    const groupId = this.pathfinding.getGroup(NAVMESH_ZONE, from)

    if (groupId === null) return []

    const path = this.pathfinding.findPath(from, to, NAVMESH_ZONE, groupId)

    if (!path || path.length === 0) {
      return []
    }
    return path
  }

  /** Checks if a point is within the navmesh boundaries. */
  public isPointOnNavMesh(point: THREE.Vector3): boolean {
    if (!this.ready) return false
    return this.pathfinding.getGroup(NAVMESH_ZONE, point) !== null
  }
}
