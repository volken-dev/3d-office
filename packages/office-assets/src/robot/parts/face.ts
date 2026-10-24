import type { PartVertex } from "../geometry/mesh-part.ts"
import { addVectors, type Vector3 } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/** The face's morph targets, in the order the mesh lists them (`extras.targetNames`). */
export const FACE_TARGET_NAMES = [
  "blink",
  "happy",
  "sad",
  "angry",
  "wide",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "mouth_smile",
  "mouth_open",
  "mouth_flat",
  "mouth_frown",
] as const

/** One of {@link FACE_TARGET_NAMES}. */
export type FaceTargetName = (typeof FACE_TARGET_NAMES)[number]

/** A face vertex's position in each morph target that moves it. */
export type FaceTargetPositions = Partial<Record<FaceTargetName, Vector3>>

/** The plane the face is drawn in, just in front of the face glass. */
const FACE_Z = 0.313

/** The mouth's height. */
const MOUTH_Y = 0.808

interface FaceSample {
  base: Vector3
  targets: FaceTargetPositions
}

/** An eye: a squircle that each target reshapes (a lid line, an arc, slanted brows, wide, looks). */
function eyeSample(side: number, u: number, v: number): FaceSample {
  const centerX = side * 0.105
  const centerY = 0.93
  const halfWidth = 0.05
  const halfHeight = 0.066
  const extent = Math.max(Math.abs(u), Math.abs(v))
  const squircle = extent === 0 ? 0 : extent / (Math.abs(u) ** 5 + Math.abs(v) ** 5) ** 0.2
  const x = halfWidth * u * squircle
  const y = halfHeight * v * squircle
  const base: Vector3 = [centerX + x, centerY + y, FACE_Z]
  const outerness = (side * u + 1) / 2
  const arcAngle = u * 1.2
  const arcRadius = 0.058
  const bandRadius = arcRadius + v * 0.016
  return {
    base,
    targets: {
      blink: [centerX + x * 1.08, centerY - 0.012 + y * 0.09, FACE_Z],
      happy: [
        centerX + bandRadius * Math.sin(arcAngle),
        centerY - arcRadius * 0.45 + bandRadius * Math.cos(arcAngle),
        FACE_Z,
      ],
      sad: [
        centerX + x,
        centerY + y * 0.85 - halfHeight * 0.6 * Math.max(0, v) * outerness,
        FACE_Z,
      ],
      angry: [
        centerX + x,
        centerY + y * 0.85 - halfHeight * 0.6 * Math.max(0, v) * (1 - outerness),
        FACE_Z,
      ],
      wide: [centerX + x * 1.2, centerY + y * 1.2, FACE_Z],
      look_left: addVectors(base, [0.04, 0, 0]),
      look_right: addVectors(base, [-0.04, 0, 0]),
      look_up: addVectors(base, [0, 0.035, 0]),
      look_down: addVectors(base, [0, -0.035, 0]),
    },
  }
}

/**
 * The mouth: collapsed to a point in the base shape (invisible; the robot has no mouth unless a
 * mouth target is weighted), opening into a smile, frown, open ring or flat line.
 */
function mouthSample(u: number, v: number): FaceSample {
  const arcRadius = 0.05
  const bandRadius = arcRadius + v * 0.009
  const smileAngle = u * 0.95
  const frownAngle = u * 0.8
  const openAngle = u * Math.PI
  return {
    base: [0, MOUTH_Y, FACE_Z],
    targets: {
      mouth_smile: [
        bandRadius * Math.sin(smileAngle),
        MOUTH_Y + 0.55 * arcRadius - bandRadius * Math.cos(smileAngle),
        FACE_Z,
      ],
      mouth_frown: [
        bandRadius * Math.sin(frownAngle),
        MOUTH_Y - 0.75 * arcRadius + bandRadius * Math.cos(frownAngle),
        FACE_Z,
      ],
      mouth_open: [
        (0.03 + v * 0.009) * Math.sin(openAngle),
        MOUTH_Y + (0.036 + v * 0.009) * Math.cos(openAngle),
        FACE_Z,
      ],
      mouth_flat: [u * 0.045, MOUTH_Y + v * 0.008, FACE_Z],
    },
  }
}

/**
 * The face: both eyes and the mouth as one morphing primitive in the `face` group, rigid on the
 * head, degenerate triangles kept (they open up through the targets). Returns each vertex's target
 * positions, in vertex order, for writing the morph targets.
 */
export function emitFace(body: BodyBuilder): FaceTargetPositions[] {
  const vertices: PartVertex[] = []
  const triangles: [number, number, number][] = []
  const targetsPerVertex: FaceTargetPositions[] = []
  const quadGrid = (
    columns: number,
    rows: number,
    sampleAt: (u: number, v: number) => FaceSample,
  ) => {
    const base = vertices.length
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u = -1 + (2 * column) / columns
        const v = -1 + (2 * row) / rows
        const sample = sampleAt(u, v)
        vertices.push({ position: sample.base, uv: [(u + 1) / 2, (v + 1) / 2] })
        targetsPerVertex.push(sample.targets)
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const corner = base + row * (columns + 1) + column
        const nextColumn = corner + 1
        const nextRow = corner + columns + 1
        const diagonal = nextRow + 1
        triangles.push([corner, nextColumn, diagonal], [corner, diagonal, nextRow])
      }
    }
  }
  for (const side of [-1, 1]) {
    quadGrid(body.lite ? 8 : 12, body.lite ? 8 : 10, (u, v) => eyeSample(side, u, v))
  }
  quadGrid(body.lite ? 14 : 22, 2, mouthSample)
  body.emitToGroup("face", "eye", { vertices, triangles }, body.rigid("head"), true)
  return targetsPerVertex
}
