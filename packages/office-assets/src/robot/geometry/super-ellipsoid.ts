import { lerp } from "../scalar-easing.ts"
import { addVectors, type ReadonlyVector3, scaleVector } from "../vector3.ts"
import { gridPart, type MeshPart, transformPart } from "./mesh-part.ts"
import { scaledSegments, type Tessellation } from "./tessellation.ts"

function signOf(value: number): number {
  return value < 0 ? -1 : 1
}

function signedCosinePower(angle: number, exponent: number): number {
  return signOf(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** exponent
}

function signedSinePower(angle: number, exponent: number): number {
  return signOf(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** exponent
}

/**
 * An axis-aligned super-ellipsoid, the robot's basic rounded-box shape. `exponent` sets the
 * squareness: small is boxy, 1 is an ellipsoid. Ring and side counts follow the mesh density.
 */
export function superEllipsoid(
  tessellation: Tessellation,
  center: ReadonlyVector3,
  halfExtents: ReadonlyVector3,
  exponent: number,
  rings = 10,
  sides = 20,
): MeshPart {
  const ringCount = scaledSegments(tessellation, rings)
  const sideCount = scaledSegments(tessellation, sides)
  return gridPart(ringCount, sideCount, (ring, side) => {
    const latitude = lerp(-Math.PI / 2, Math.PI / 2, ring / (ringCount - 1))
    const longitude = (2 * Math.PI * side) / sideCount
    return [
      center[0] +
        halfExtents[0] *
          signedCosinePower(latitude, exponent) *
          signedCosinePower(longitude, exponent),
      center[1] + halfExtents[1] * signedSinePower(latitude, exponent),
      center[2] +
        halfExtents[2] *
          signedCosinePower(latitude, exponent) *
          signedSinePower(longitude, exponent),
    ]
  })
}

/** A super-ellipsoid in the frame of the axes `axisX`, `axisY`, `axisZ`, centred at `center`. */
export function orientedSuperEllipsoid(
  tessellation: Tessellation,
  center: ReadonlyVector3,
  halfExtents: ReadonlyVector3,
  exponent: number,
  axisX: ReadonlyVector3,
  axisY: ReadonlyVector3,
  axisZ: ReadonlyVector3,
  rings = 10,
  sides = 20,
): MeshPart {
  return transformPart(
    superEllipsoid(tessellation, [0, 0, 0], halfExtents, exponent, rings, sides),
    (position) =>
      addVectors(
        center,
        addVectors(
          addVectors(scaleVector(axisX, position[0]), scaleVector(axisY, position[1])),
          scaleVector(axisZ, position[2]),
        ),
      ),
  )
}
