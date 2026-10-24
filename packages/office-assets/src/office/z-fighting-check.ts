import type { MaterialGeometry } from "./office-geometry.ts"
import {
  addVectors,
  crossProduct,
  scaleVector,
  subtractVectors,
  type Vector2,
  type Vector3,
  vectorLength,
} from "./vector-math.ts"

/** Faces closer than this (4 mm) on the same plane z-fight at overview distance. */
const Z_FIGHT_DISTANCE = 0.004

/** Plane-bucket cell size on the plane, in metres. */
const BUCKET_SIZE = 0.5

/** How a z-fight is reported: `fail` throws (the default), `warn` only warns (`ZFIGHT=warn`). */
export type ZFightingMode = "fail" | "warn"

/** The room's inner bounds, for skipping backs pressed against a wall. */
export interface RoomBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface CheckedTriangle {
  node: string
  material: string
  partId: number
  curved: boolean
  normal: Vector3
  planeOffset: number
  /** The triangle projected onto the plane of its dominant normal axis. */
  projected: Vector2[]
  firstCorner: Vector3
  area: number
  centroid: Vector3
}

interface ZFightReport {
  triangles: number
  at: number[]
  at2: number[]
  gap: number
}

/**
 * True when a separating axis exists between two projected triangles, with a 1 mm margin so
 * touching edges don't count as overlap.
 */
function separated(first: Vector2[], second: Vector2[]): boolean {
  for (const triangle of [first, second]) {
    for (let edge = 0; edge < 3; edge++) {
      const start = triangle[edge]
      const end = triangle[(edge + 1) % 3]
      const axis: Vector2 = [end[1] - start[1], start[0] - end[0]]
      const axisLength = Math.hypot(...axis) || 1
      const project = (points: Vector2[]): number[] =>
        points.map((point) => (point[0] * axis[0] + point[1] * axis[1]) / axisLength)
      const firstProjection = project(first)
      const secondProjection = project(second)
      if (
        Math.min(Math.max(...firstProjection), Math.max(...secondProjection)) -
          Math.max(Math.min(...firstProjection), Math.min(...secondProjection)) <
        0.001
      ) {
        return true
      }
    }
  }
  return false
}

/** Never-seen faces: bottoms resting on the floor, and backs facing into a wall, against it. */
function hiddenFace(corners: Vector3[], cross: Vector3, area: number, room: RoomBounds): boolean {
  if (cross[1] / area < -0.9 && corners.every((corner) => corner[1] < 0.02)) return true
  const wallBacks: [number, number, number][] = [
    [2, -1, room.minZ],
    [0, -1, room.minX],
    [2, 1, room.maxZ],
    [0, 1, room.maxX],
  ]
  return wallBacks.some(
    ([axis, direction, wall]) =>
      (cross[axis] / area) * direction > 0.99 &&
      corners.every((corner) => Math.abs(corner[axis] - wall) < 0.025),
  )
}

/**
 * Pairs that can't flicker: one part's own faces (they never overlap), tiny triangles and small
 * curved-mesh triangles (meshes passing through each other, which only meet along a line), plant
 * against plant, day-only against night-only, and pairs not facing the same way (opposite-facing
 * pairs are back to back and culled).
 */
function exempt(first: CheckedTriangle, second: CheckedTriangle): boolean {
  return (
    first.partId === second.partId ||
    Math.max(first.area, second.area) < 6e-4 ||
    (first.curved &&
      second.curved &&
      (Math.max(first.area, second.area) < 4e-3 ||
        (/^plant_/.test(first.material) && /^plant_/.test(second.material)))) ||
    (/^(day|night)-only/.test(first.node) && /^(day|night)-only/.test(second.node)) ||
    first.normal[0] * second.normal[0] +
      first.normal[1] * second.normal[1] +
      first.normal[2] * second.normal[2] <
      0.9995
  )
}

/**
 * The z-fighting check: coplanar (under 4 mm apart), same-facing, overlapping triangles from
 * different parts flicker at overview distance, so the build fails and says where (the first 25
 * node and material pairs). Triangles are bucketed by quantised normal, plane offset and a grid
 * on the plane, and only neighbouring buckets are compared. The `navMesh` node is skipped.
 */
export function checkZFighting(
  nodes: Map<string, Map<string, MaterialGeometry>>,
  room: RoomBounds,
  mode: ZFightingMode,
): void {
  const triangles: CheckedTriangle[] = []
  const planes = new Map<string, Map<string, number[]>>()
  for (const [node, materials] of nodes) {
    if (node === "navMesh") continue
    for (const [material, geometry] of materials) {
      for (let t = 0; t < geometry.indices.length; t += 3) {
        const corners = [0, 1, 2].map((k): Vector3 => {
          const vertex = geometry.indices[t + k] * 3
          return [
            geometry.positions[vertex],
            geometry.positions[vertex + 1],
            geometry.positions[vertex + 2],
          ]
        })
        const cross = crossProduct(
          subtractVectors(corners[1], corners[0]),
          subtractVectors(corners[2], corners[0]),
        )
        const doubleArea = vectorLength(cross)
        if (doubleArea < 1e-6) continue
        if (hiddenFace(corners, cross, doubleArea, room)) continue
        const normal = scaleVector(cross, 1 / doubleArea)
        const planeOffset =
          normal[0] * corners[0][0] + normal[1] * corners[0][1] + normal[2] * corners[0][2]
        const dominantAxis = [0, 1, 2].reduce(
          (best, axis) => (Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best),
          0,
        )
        const projected = corners.map(
          (corner): Vector2 => [corner[(dominantAxis + 1) % 3], corner[(dominantAxis + 2) % 3]],
        )
        const id = triangles.length
        triangles.push({
          node,
          material,
          partId: geometry.partIds[t / 3],
          curved: geometry.curvedFlags[t / 3],
          normal,
          planeOffset,
          projected,
          firstCorner: corners[0],
          area: doubleArea / 2,
          centroid: scaleVector(addVectors(addVectors(corners[0], corners[1]), corners[2]), 1 / 3),
        })
        const planeKey = `${Math.round(normal[0] * 40)},${Math.round(normal[1] * 40)},${Math.round(normal[2] * 40)}`
        let cells = planes.get(planeKey)
        if (cells === undefined) {
          cells = new Map()
          planes.set(planeKey, cells)
        }
        const [minU, maxU] = [
          Math.min(...projected.map((point) => point[0])),
          Math.max(...projected.map((point) => point[0])),
        ]
        const [minV, maxV] = [
          Math.min(...projected.map((point) => point[1])),
          Math.max(...projected.map((point) => point[1])),
        ]
        for (let i = Math.floor(minU / BUCKET_SIZE); i <= Math.floor(maxU / BUCKET_SIZE); i++) {
          for (let j = Math.floor(minV / BUCKET_SIZE); j <= Math.floor(maxV / BUCKET_SIZE); j++) {
            const cellKey = `${i},${j},${Math.round(planeOffset / Z_FIGHT_DISTANCE)}`
            let ids = cells.get(cellKey)
            if (ids === undefined) {
              ids = []
              cells.set(cellKey, ids)
            }
            ids.push(id)
          }
        }
      }
    }
  }
  const hits = new Map<string, ZFightReport>()
  const comparedPairs = new Set<string>()
  for (const cells of planes.values()) {
    for (const [cellKey, ids] of cells) {
      const [i, j, offsetKey] = cellKey.split(",").map(Number)
      const nearby = [
        ...ids,
        ...(cells.get(`${i},${j},${offsetKey + 1}`) || []),
        ...(cells.get(`${i},${j},${offsetKey + 2}`) || []),
      ]
      for (const a of ids) {
        for (const b of nearby) {
          if (a === b) continue
          const first = triangles[a]
          const second = triangles[b]
          if (exempt(first, second)) continue
          const gap = Math.max(
            Math.abs(
              first.normal[0] * second.centroid[0] +
                first.normal[1] * second.centroid[1] +
                first.normal[2] * second.centroid[2] -
                first.planeOffset,
            ),
            Math.abs(
              second.normal[0] * first.centroid[0] +
                second.normal[1] * first.centroid[1] +
                second.normal[2] * first.centroid[2] -
                second.planeOffset,
            ),
          )
          if (gap >= Z_FIGHT_DISTANCE) continue
          const pairKey = a < b ? `${a}/${b}` : `${b}/${a}`
          if (comparedPairs.has(pairKey)) continue
          comparedPairs.add(pairKey)
          if (separated(first.projected, second.projected)) continue
          const hitKey = [`${first.node}:${first.material}`, `${second.node}:${second.material}`]
            .sort()
            .join(" vs ")
          let report = hits.get(hitKey)
          if (report === undefined) {
            report = {
              triangles: 0,
              at: first.firstCorner.map((value) => Number(value.toFixed(2))),
              at2: second.firstCorner.map((value) => Number(value.toFixed(2))),
              gap,
            }
            hits.set(hitKey, report)
          }
          report.triangles++
        }
      }
    }
  }
  if (!hits.size) return
  const message = [...hits]
    .slice(0, 25)
    .map(
      ([key, report]) =>
        `  ${key}: ${report.triangles} tris, ${(report.gap * 1000).toFixed(1)} mm apart, near [${report.at}] / [${report.at2}]`,
    )
    .join("\n")
  if (mode === "warn") {
    console.warn(`z-fighting (${hits.size} pairs):\n${message}`)
    return
  }
  throw new Error(
    `z-fighting: coplanar overlapping faces (keep stacked faces >= ${Z_FIGHT_DISTANCE * 1000} mm apart):\n${message}`,
  )
}
