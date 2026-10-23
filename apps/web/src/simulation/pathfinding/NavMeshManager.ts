import { type NavMesh, NavMeshQuery } from "@recast-navigation/core"
import { threeToSoloNavMesh } from "@recast-navigation/three"
import * as THREE from "three/webgpu"

/**
 * Recast build settings for the office floor, which is a flat, hand-authored walkable area.
 * Cell size and height are in world units; the walkable* values are in cells. Characters are not
 * eroded away from the edges (walkableRadius 0): the authored mesh already keeps them clear of
 * furniture, and POIs such as chairs sit close to its edge.
 */
const NAVMESH_CONFIG = {
  cs: 0.05,
  ch: 0.05,
  walkableRadius: 0,
  walkableHeight: 4,
  walkableClimb: 2,
  walkableSlopeAngle: 45,
}

/**
 * How far (on each horizontal axis) a point may be from the built navmesh and still count as on
 * it. Voxelising trims up to one cell (0.05) off the authored mesh's border, so a point on the
 * authored mesh is always within this distance of the built one.
 */
export const NAVMESH_EDGE_TOLERANCE = 0.1
const QUERY_HALF_EXTENTS = { x: NAVMESH_EDGE_TOLERANCE, y: 0.5, z: NAVMESH_EDGE_TOLERANCE }

/**
 * The office navigation mesh: built with Recast from the hidden navmesh geometry in the office GLB,
 * and queried with Detour. Load the runtime first (`loadNavigationRuntime`).
 */
export class NavMeshManager {
  private navMesh: NavMesh | null = null
  private query: NavMeshQuery | null = null

  /**
   * Builds the navmesh from the geometry's raw vertex positions; the node's transform is ignored,
   * as the office GLB's navmesh node has none. Replaces any previously loaded navmesh.
   * Throws if Recast cannot build a navmesh from it.
   */
  public loadFromGeometry(geometry: THREE.BufferGeometry): void {
    const result = threeToSoloNavMesh([new THREE.Mesh(geometry)], NAVMESH_CONFIG)
    if (!result.success) throw new Error(`NavMeshManager: navmesh build failed: ${result.error}`)
    this.dispose()
    this.navMesh = result.navMesh
    this.query = new NavMeshQuery(result.navMesh)
  }

  /** The built navmesh, for the crowd; null until `loadFromGeometry`. */
  public getNavMesh(): NavMesh | null {
    return this.navMesh
  }

  /**
   * Finds a path from `from` to `to`. Returns the corners of the straightened path, excluding the
   * start and ending at the navmesh point closest to `to`, or [] when the navmesh is not loaded,
   * either end is off the navmesh, or `to` cannot be reached from `from`.
   */
  public findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    if (!this.query || !this.isPointOnNavMesh(from) || !this.isPointOnNavMesh(to)) return []
    const result = this.query.computePath(from, to, { halfExtents: QUERY_HALF_EXTENTS })
    if (!result.success || result.path.length < 2) return []
    const end = result.path[result.path.length - 1]
    if (Math.hypot(end.x - to.x, end.z - to.z) > NAVMESH_EDGE_TOLERANCE * Math.SQRT2) return []
    return result.path.slice(1).map((corner) => new THREE.Vector3(corner.x, corner.y, corner.z))
  }

  /** Whether the point is on the navmesh, within NAVMESH_EDGE_TOLERANCE. */
  public isPointOnNavMesh(point: THREE.Vector3): boolean {
    if (!this.query) return false
    const nearest = this.query.findNearestPoly(point, { halfExtents: QUERY_HALF_EXTENTS })
    return nearest.success && nearest.nearestRef !== 0
  }

  /** Frees the navmesh and its query in the WebAssembly heap. Idempotent. */
  public dispose(): void {
    this.query?.destroy()
    this.navMesh?.destroy()
    this.query = null
    this.navMesh = null
  }
}
