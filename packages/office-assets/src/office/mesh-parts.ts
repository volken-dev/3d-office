import {
  addVectors,
  crossProduct,
  degreesToRadians,
  normalizeVector,
  scaleVector,
  subtractVectors,
  type Vector2,
  type Vector3,
} from "./vector-math.ts"

/**
 * A piece of geometry in its own local space, before a frame places it: one entry per vertex in
 * `positions`, `normals` and `uvs`, and triangles as index triples.
 */
export interface MeshPart {
  positions: Vector3[]
  normals: Vector3[]
  uvs: Vector2[]
  indices: number[]
}

function emptyPart(): MeshPart {
  return { positions: [], normals: [], uvs: [], indices: [] }
}

/** The corners of a unit quad, in winding order. */
const QUAD_CORNERS: Vector2[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/**
 * An axis-aligned box centred on `center` with full extents `size`. Each face gets its own four
 * vertices; UVs run in metres divided by `uvScale`.
 */
export function boxPart(center: Vector3, size: Vector3, uvScale = 1): MeshPart {
  const part = emptyPart()
  const half = scaleVector(size, 0.5)
  const faces: [Vector3, Vector3, Vector3, number, number, number][] = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0], half[0], half[2], half[1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0], half[0], half[2], half[1]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1], half[1], half[0], half[2]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1], half[1], half[0], half[2]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0], half[2], half[0], half[1]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0], half[2], half[0], half[1]],
  ]
  for (const [normal, uAxis, vAxis, normalExtent, uExtent, vExtent] of faces) {
    const base = part.positions.length
    const faceCenter = addVectors(center, scaleVector(normal, normalExtent))
    for (const [a, b] of QUAD_CORNERS) {
      part.positions.push(
        addVectors(
          faceCenter,
          addVectors(scaleVector(uAxis, a * uExtent), scaleVector(vAxis, b * vExtent)),
        ),
      )
      part.normals.push(normal)
      part.uvs.push([((a + 1) * uExtent) / uvScale, ((1 - b) * vExtent) / uvScale])
    }
    part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return part
}

/** A single quad; `uHalf` and `vHalf` are half-extent vectors and the normal is `uHalf x vHalf`. */
export function quadPart(center: Vector3, uHalf: Vector3, vHalf: Vector3): MeshPart {
  const normal = normalizeVector(crossProduct(uHalf, vHalf))
  const part: MeshPart = {
    positions: [],
    normals: [],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    indices: [0, 1, 2, 0, 2, 3],
  }
  for (const [a, b] of QUAD_CORNERS) {
    part.positions.push(
      addVectors(center, addVectors(scaleVector(uHalf, a), scaleVector(vHalf, b))),
    )
    part.normals.push(normal)
  }
  return part
}

function signOf(value: number): number {
  return value < 0 ? -1 : 1
}

function signedCosinePower(angle: number, exponent: number): number {
  return signOf(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** exponent
}

function signedSinePower(angle: number, exponent: number): number {
  return signOf(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** exponent
}

/** Rounds a position to 0.1 mm for welding normals across seams. */
function weldKey(position: Vector3): string {
  return position.map((coordinate) => Math.round(coordinate * 1e4)).join(",")
}

/**
 * A super-ellipsoid with half extents `half` and separate exponents: `profileExponent` shapes the
 * vertical profile, `planExponent` the plan (1 is round in plan; smaller is boxier). Normals are
 * smooth, accumulated from the faces round each position, welded by position.
 */
export function superEllipsoidPart(
  center: Vector3,
  half: Vector3,
  profileExponent: number,
  planExponent: number,
  rings: number,
  sides: number,
): MeshPart {
  const part = emptyPart()
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j <= sides; j++) {
      const latitude = -Math.PI / 2 + (Math.PI * i) / (rings - 1)
      const longitude = (2 * Math.PI * j) / sides
      part.positions.push([
        center[0] +
          half[0] *
            signedCosinePower(latitude, profileExponent) *
            signedCosinePower(longitude, planExponent),
        center[1] + half[1] * signedSinePower(latitude, profileExponent),
        center[2] +
          half[2] *
            signedCosinePower(latitude, profileExponent) *
            signedSinePower(longitude, planExponent),
      ])
      part.uvs.push([j / sides, i / (rings - 1)])
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const corner = i * (sides + 1) + j
      const next = corner + 1
      const above = corner + sides + 1
      const aboveNext = above + 1
      part.indices.push(corner, above, next, next, above, aboveNext)
    }
  }
  const accumulated = new Map<string, Vector3>()
  for (let t = 0; t < part.indices.length; t += 3) {
    const first = part.positions[part.indices[t]]
    const second = part.positions[part.indices[t + 1]]
    const third = part.positions[part.indices[t + 2]]
    const faceNormal = crossProduct(subtractVectors(second, first), subtractVectors(third, first))
    for (const position of [first, second, third]) {
      const key = weldKey(position)
      accumulated.set(key, addVectors(accumulated.get(key) || [0, 0, 0], faceNormal))
    }
  }
  part.normals = part.positions.map((position) =>
    normalizeVector(accumulated.get(weldKey(position)) || [0, 1, 0]),
  )
  return part
}

/**
 * A tapered tube from `start` (radius `startRadius`) to `end` (radius `endRadius`) with open ends:
 * cap them with a knot where they show.
 */
export function tubePart(
  start: Vector3,
  end: Vector3,
  startRadius: number,
  endRadius: number,
  sides: number,
): MeshPart {
  const direction = normalizeVector(subtractVectors(end, start))
  const firstAxis = normalizeVector(
    crossProduct(Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], direction),
  )
  const secondAxis = crossProduct(direction, firstAxis)
  const part = emptyPart()
  for (let k = 0; k <= sides; k++) {
    const angle = (2 * Math.PI * k) / sides
    const normal = addVectors(
      scaleVector(firstAxis, Math.cos(angle)),
      scaleVector(secondAxis, Math.sin(angle)),
    )
    part.positions.push(
      addVectors(start, scaleVector(normal, startRadius)),
      addVectors(end, scaleVector(normal, endRadius)),
    )
    part.normals.push(normal, normal)
    part.uvs.push([k / sides, 0], [k / sides, 1])
  }
  for (let k = 0; k < sides; k++) {
    const corner = 2 * k
    part.indices.push(corner, corner + 2, corner + 1, corner + 2, corner + 3, corner + 1)
  }
  return part
}

/** The shape of a ring sector: radii, heights and the angle range in degrees. */
export interface RingShape {
  innerRadius: number
  outerRadius: number
  bottom: number
  top: number
  startAngle: number
  endAngle: number
  segments: number
}

/**
 * An annular sector prism round the local origin: radius inner to outer, height bottom to top,
 * angle start to end in degrees (0 is -z, growing toward +x). A partial sector gets end caps; an
 * inner radius of zero drops the inner wall.
 */
export function ringPart(shape: RingShape): MeshPart {
  const { innerRadius, outerRadius, bottom, top, startAngle, endAngle, segments } = shape
  const part = emptyPart()
  const full = Math.abs(endAngle - startAngle) >= 360 - 1e-6
  const pointAt = (radius: number, angle: number, y: number): Vector3 => [
    radius * Math.sin(degreesToRadians(angle)),
    y,
    -radius * Math.cos(degreesToRadians(angle)),
  ]
  const outward = (angle: number): Vector3 => [
    Math.sin(degreesToRadians(angle)),
    0,
    -Math.cos(degreesToRadians(angle)),
  ]
  const strip = (verticesAt: (angle: number) => [Vector3, Vector3][]): void => {
    const base = part.positions.length
    for (let k = 0; k <= segments; k++) {
      const angle = startAngle + ((endAngle - startAngle) * k) / segments
      for (const [position, normal] of verticesAt(angle)) {
        part.positions.push(position)
        part.normals.push(normal)
        part.uvs.push([k / segments, 0])
      }
    }
    for (let k = 0; k < segments; k++) {
      const corner = base + k * 2
      const next = corner + 2
      if (endAngle > startAngle)
        part.indices.push(corner, corner + 1, next, next, corner + 1, next + 1)
      else part.indices.push(corner, next, corner + 1, next, next + 1, corner + 1)
    }
  }
  strip((angle) => [
    [pointAt(outerRadius, angle, top), [0, 1, 0]],
    [pointAt(innerRadius, angle, top), [0, 1, 0]],
  ])
  strip((angle) => [
    [pointAt(innerRadius, angle, bottom), [0, -1, 0]],
    [pointAt(outerRadius, angle, bottom), [0, -1, 0]],
  ])
  strip((angle) => [
    [pointAt(outerRadius, angle, bottom), outward(angle)],
    [pointAt(outerRadius, angle, top), outward(angle)],
  ])
  if (innerRadius > 1e-6) {
    strip((angle) => [
      [pointAt(innerRadius, angle, top), scaleVector(outward(angle), -1)],
      [pointAt(innerRadius, angle, bottom), scaleVector(outward(angle), -1)],
    ])
  }
  if (!full) {
    const caps: [number, number][] = [
      [startAngle, -1],
      [endAngle, 1],
    ]
    for (const [angle, side] of caps) {
      const normal = scaleVector(
        [Math.cos(degreesToRadians(angle)), 0, Math.sin(degreesToRadians(angle))],
        side * Math.sign(endAngle - startAngle),
      )
      const base = part.positions.length
      for (const position of [
        pointAt(innerRadius, angle, bottom),
        pointAt(outerRadius, angle, bottom),
        pointAt(outerRadius, angle, top),
        pointAt(innerRadius, angle, top),
      ]) {
        part.positions.push(position)
        part.normals.push(normal)
        part.uvs.push([0, 0])
      }
      const winding = crossProduct(
        subtractVectors(part.positions[base + 1], part.positions[base]),
        subtractVectors(part.positions[base + 2], part.positions[base]),
      )
      if (winding[0] * normal[0] + winding[2] * normal[2] > 0) {
        part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      } else part.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
  }
  return part
}

/**
 * A flat convex polygon at height `y` facing +y; `points` are `[x, z]` in either winding. UVs are
 * the plan coordinates.
 */
export function polygonPart(points: Vector2[], y: number): MeshPart {
  const part: MeshPart = {
    positions: points.map(([x, z]) => [x, y, z]),
    normals: points.map(() => [0, 1, 0]),
    uvs: points.map(([x, z]) => [x, z]),
    indices: [],
  }
  for (let i = 1; i < points.length - 1; i++) {
    const first = points[0]
    const second = points[i]
    const third = points[i + 1]
    const winding =
      (second[0] - first[0]) * (third[1] - first[1]) -
      (second[1] - first[1]) * (third[0] - first[0])
    part.indices.push(0, ...(winding < 0 ? [i, i + 1] : [i + 1, i]))
  }
  return part
}

/**
 * A curved panel facing +z, concave toward +z: centre `center`, arc length `width`, height
 * `height`, radius `radius`. A non-zero `back` builds the shell that far behind it, facing -z.
 */
export function curvedPanelPart(
  center: Vector3,
  width: number,
  height: number,
  radius: number,
  segments: number,
  back: number,
): MeshPart {
  const part = emptyPart()
  const halfAngle = width / (2 * radius)
  for (let k = 0; k <= segments; k++) {
    const angle = -halfAngle + (2 * halfAngle * k) / segments
    const normal: Vector3 = [-Math.sin(angle), 0, Math.cos(angle)]
    const x = center[0] + radius * Math.sin(angle)
    const z = center[2] + radius * (1 - Math.cos(angle)) - normal[2] * back
    const shiftedX = x - normal[0] * back
    const rows: Vector2[] = [
      [-height / 2, 1],
      [height / 2, 0],
    ]
    for (const [offsetY, v] of rows) {
      part.positions.push([shiftedX, center[1] + offsetY, z])
      part.normals.push(back ? scaleVector(normal, -1) : normal)
      part.uvs.push([k / segments, v])
    }
  }
  for (let k = 0; k < segments; k++) {
    const bottom = 2 * k
    const nextBottom = bottom + 2
    const nextTop = bottom + 3
    const top = bottom + 1
    if (back) part.indices.push(bottom, nextTop, nextBottom, bottom, top, nextTop)
    else part.indices.push(bottom, nextBottom, nextTop, bottom, nextTop, top)
  }
  return part
}
