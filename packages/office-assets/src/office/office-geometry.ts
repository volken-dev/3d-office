import type { MeshPart } from "./mesh-parts.ts"
import type { Vector3 } from "./vector-math.ts"

/** Places local geometry in the world: a point transform and the matching normal transform. */
export interface FrameTransform {
  point(position: Vector3): Vector3
  normal(normal: Vector3): Vector3
}

/** The identity transform, for geometry already in world space. */
export const WORLD_TRANSFORM: FrameTransform = {
  point: (position) => position,
  normal: (normal) => normal,
}

/**
 * The world-space triangles of one material in one node, as flat arrays (xyz, xyz, ...). Each
 * triangle records the id of the part it came from and whether that part was a curved mesh, so the
 * z-fighting check can tell separate pieces from one piece's own faces.
 */
export interface MaterialGeometry {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  partIds: number[]
  curvedFlags: boolean[]
}

/**
 * The office's geometry as it is built: node name to material name to triangles. Insertion order is
 * kept everywhere, because it decides the node, mesh, material and accessor order of the GLB.
 */
export class OfficeGeometry {
  readonly nodes = new Map<string, Map<string, MaterialGeometry>>()
  /** Parts pushed so far; every part gets the next id. */
  partCount = 0
  /** Triangles pushed so far, for the per-item-type triangle report (`TRIS=1`). */
  triangleCount = 0

  /** Transforms a part into the world and appends it to `node` under `material`. */
  push(
    node: string,
    material: string,
    part: MeshPart,
    transform: FrameTransform,
    curved = false,
  ): void {
    let materials = this.nodes.get(node)
    if (materials === undefined) {
      materials = new Map()
      this.nodes.set(node, materials)
    }
    let geometry = materials.get(material)
    if (geometry === undefined) {
      geometry = { positions: [], normals: [], uvs: [], indices: [], partIds: [], curvedFlags: [] }
      materials.set(material, geometry)
    }
    const base = geometry.positions.length / 3
    this.partCount++
    this.triangleCount += part.indices.length / 3
    for (let t = 0; t < part.indices.length; t += 3) {
      geometry.partIds.push(this.partCount)
      geometry.curvedFlags.push(curved)
    }
    const target = geometry
    part.positions.forEach((position, vertex) => {
      const worldPosition = transform.point(position)
      const worldNormal = transform.normal(part.normals[vertex])
      target.positions.push(...worldPosition)
      target.normals.push(...worldNormal)
      target.uvs.push(...part.uvs[vertex])
    })
    for (const index of part.indices) target.indices.push(base + index)
  }
}
