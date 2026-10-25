import { drawCallBucket, statusSlot } from "./draw-call-buckets.ts"
import type { MaterialGeometry } from "./office-geometry.ts"
import type { Vector2 } from "./vector-math.ts"

/**
 * One draw call's geometry after merging, as flat arrays; `colors` is the baked AO (`COLOR_0`),
 * set on the static opaque nodes.
 */
export interface MergedGeometry {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  colors?: Float32Array
}

/** Where each merged material's UVs point. */
export interface MergeTargets {
  statusTextureWidth: number
  paletteUvs: Map<string, Vector2>
  screenAtlasRects: Record<string, number[]>
}

/**
 * Regroups each node's per-material geometry into its draw-call buckets (see
 * {@link drawCallBucket}), remapping UVs: a status material samples its slot's texel, a palette
 * material its cell centre, a screen its rectangle of the atlas; the rest keep their own.
 */
export function mergeDrawCalls(
  nodes: Map<string, Map<string, MaterialGeometry>>,
  targets: MergeTargets,
): Map<string, Map<string, MergedGeometry>> {
  const merged = new Map<string, Map<string, MergedGeometry>>()
  for (const [node, materials] of nodes) {
    const buckets = new Map<string, MergedGeometry>()
    for (const [material, geometry] of materials) {
      const bucket = drawCallBucket(material)
      let target = buckets.get(bucket)
      if (target === undefined) {
        target = { positions: [], normals: [], uvs: [], indices: [] }
        buckets.set(bucket, target)
      }
      const base = target.positions.length / 3
      for (const value of geometry.positions) target.positions.push(value)
      for (const value of geometry.normals) target.normals.push(value)
      for (const index of geometry.indices) target.indices.push(base + index)
      const slot = statusSlot(material)
      if (slot !== null) {
        const u = (slot - 0.5) / targets.statusTextureWidth
        for (let i = 0; i < geometry.uvs.length; i += 2) target.uvs.push(u, 0.5)
      } else if (bucket === "palette") {
        const uv = targets.paletteUvs.get(material)
        if (uv === undefined) throw new Error(`palette has no cell for ${material}`)
        for (let i = 0; i < geometry.uvs.length; i += 2) target.uvs.push(uv[0], uv[1])
      } else if (bucket === "screens") {
        const [u0, v0, u1, v1] = targets.screenAtlasRects[material]
        for (let i = 0; i < geometry.uvs.length; i += 2) {
          target.uvs.push(u0 + geometry.uvs[i] * (u1 - u0), v0 + geometry.uvs[i + 1] * (v1 - v0))
        }
      } else {
        for (const value of geometry.uvs) target.uvs.push(value)
      }
    }
    merged.set(node, buckets)
  }
  return merged
}
