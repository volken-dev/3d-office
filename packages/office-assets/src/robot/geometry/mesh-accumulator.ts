import type { MaterialName } from "../material-palette.ts"
import { crossProduct, subtractVectors, vectorLength } from "../vector3.ts"
import type { MeshPart } from "./mesh-part.ts"
import type { WeightFunction } from "./skin-weights.ts"

/** Flat vertex streams for one primitive (one mesh group and material). */
export interface PrimitiveBuffers {
  positions: number[]
  uvs: number[]
  joints: number[]
  weights: number[]
  indices: number[]
  /**
   * The part each vertex came from. Normals are smoothed only within a part, so separate parts
   * that touch keep their hard edge.
   */
  partIds: number[]
}

/**
 * Lite folds the body's screen and eye parts into secondary and accent, so robot-lite's body is
 * 4 draw calls instead of 6.
 */
const LITE_MATERIAL_FOLD: Partial<Record<MaterialName, MaterialName>> = {
  screen: "secondary",
  eye: "accent",
}

/**
 * Collects emitted parts into primitives, grouped by mesh (`body`, `face`) and then material, in
 * first-emitted order (that order becomes the file's mesh and primitive order). Each vertex keeps
 * its four strongest joint influences, normalised.
 */
export class MeshAccumulator {
  readonly groups = new Map<string, Map<MaterialName, PrimitiveBuffers>>()
  private readonly lite: boolean
  private nextPartId = 0

  constructor(lite: boolean) {
    this.lite = lite
  }

  /**
   * Adds `part` to group `group` with material `material`, skinned by `weightsAt`. Degenerate
   * (zero-area) triangles are dropped unless `keepDegenerate`, which the face needs: its base
   * mouth is collapsed and only opens through morph targets.
   */
  emit(
    group: string,
    material: MaterialName,
    part: MeshPart,
    weightsAt: WeightFunction,
    keepDegenerate = false,
  ): void {
    const effectiveMaterial =
      this.lite && group === "body" ? (LITE_MATERIAL_FOLD[material] ?? material) : material
    const buffers = this.buffersFor(group, effectiveMaterial)
    const base = buffers.positions.length / 3
    const partId = this.nextPartId++
    for (const vertex of part.vertices) {
      buffers.positions.push(...vertex.position)
      buffers.uvs.push(...vertex.uv)
      buffers.partIds.push(partId)
      const strongest = weightsAt(vertex.position)
        .filter((influence) => influence[1] > 1e-4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
      const total = strongest.reduce((sum, influence) => sum + influence[1], 0)
      const joints = [0, 0, 0, 0]
      const weights = [0, 0, 0, 0]
      strongest.forEach((influence, slot) => {
        joints[slot] = influence[0]
        weights[slot] = influence[1] / total
      })
      buffers.joints.push(...joints)
      buffers.weights.push(...weights)
    }
    for (const [a, b, c] of part.triangles) {
      const pointA = part.vertices[a].position
      const pointB = part.vertices[b].position
      const pointC = part.vertices[c].position
      const area = vectorLength(
        crossProduct(subtractVectors(pointB, pointA), subtractVectors(pointC, pointA)),
      )
      if (!keepDegenerate && area < 1e-10) continue
      buffers.indices.push(base + a, base + b, base + c)
    }
  }

  private buffersFor(group: string, material: MaterialName): PrimitiveBuffers {
    let byMaterial = this.groups.get(group)
    if (!byMaterial) {
      byMaterial = new Map()
      this.groups.set(group, byMaterial)
    }
    let buffers = byMaterial.get(material)
    if (!buffers) {
      buffers = { positions: [], uvs: [], joints: [], weights: [], indices: [], partIds: [] }
      byMaterial.set(material, buffers)
    }
    return buffers
  }
}
