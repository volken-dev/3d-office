import { SLEEP_LETTERS_ANCHOR } from "../prop-anchors.ts"
import { addVectors, normalizeVector } from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/**
 * Three "Z" letters of growing size, rising to the right of the head. They are bound to the `zzz`
 * joint, which rests at scale 0 (hidden) and is scaled up only by the charging clips.
 */
export function emitSleepLetters(body: BodyBuilder): void {
  const letters: [number, number, number][] = [
    [-0.04, -0.05, 0.055],
    [0.04, 0.05, 0.075],
    [0.14, 0.18, 0.1],
  ]
  for (const [offsetX, offsetY, size] of letters) {
    const center = addVectors(SLEEP_LETTERS_ANCHOR, [offsetX, offsetY, 0])
    const sleepJoint = body.rigid("zzz")
    const diagonal = normalizeVector([1, 1, 0])
    const acrossDiagonal = normalizeVector([-1, 1, 0])
    body.emit(
      "eye",
      body.superEllipsoid(
        addVectors(center, [0, size * 0.42, 0]),
        [size * 0.45, size * 0.09, size * 0.05],
        0.4,
        6,
        12,
      ),
      sleepJoint,
    )
    body.emit(
      "eye",
      body.superEllipsoid(
        addVectors(center, [0, -size * 0.42, 0]),
        [size * 0.45, size * 0.09, size * 0.05],
        0.4,
        6,
        12,
      ),
      sleepJoint,
    )
    body.emit(
      "eye",
      body.orientedSuperEllipsoid(
        center,
        [size * 0.6, size * 0.085, size * 0.05],
        0.4,
        diagonal,
        acrossDiagonal,
        [0, 0, 1],
        6,
        12,
      ),
      sleepJoint,
    )
  }
}
