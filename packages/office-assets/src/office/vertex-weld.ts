import type { MergedGeometry } from "./draw-call-merge.ts"

/**
 * Merges bit-identical vertices (compared as float32: position, normal, UV and AO): the pole rings
 * and seams of rounded parts collapse once palette UVs are constant. Pole triangles become
 * degenerate once their ring is welded, and are dropped.
 */
export function weldVertices(geometry: MergedGeometry): MergedGeometry {
  const { positions, normals, uvs, indices, colors } = geometry
  const vertexCount = positions.length / 3
  const firstByKey = new Map<string, number>()
  const remap = new Uint32Array(vertexCount)
  const welded: MergedGeometry = { positions: [], normals: [], uvs: [], indices: [] }
  const weldedColors: number[] = []
  for (let i = 0; i < vertexCount; i++) {
    const key = [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
      normals[i * 3],
      normals[i * 3 + 1],
      normals[i * 3 + 2],
      uvs[i * 2],
      uvs[i * 2 + 1],
      colors ? colors[i * 3] : 0,
    ]
      .map((value) => Math.fround(value))
      .join(",")
    let k = firstByKey.get(key)
    if (k === undefined) {
      k = welded.positions.length / 3
      firstByKey.set(key, k)
      welded.positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      welded.normals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
      welded.uvs.push(uvs[i * 2], uvs[i * 2 + 1])
      if (colors) weldedColors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
    }
    remap[i] = k
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]]
    const b = remap[indices[t + 1]]
    const c = remap[indices[t + 2]]
    if (a !== b && b !== c && a !== c) welded.indices.push(a, b, c)
  }
  if (colors) welded.colors = new Float32Array(weldedColors)
  return welded
}
