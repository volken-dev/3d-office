import {
  addVectors,
  crossProduct,
  dotProduct,
  normalizeVector,
  scaleVector,
  subtractVectors,
  vectorLength,
} from "../vector3.ts"
import type { BodyBuilder } from "./body-builder.ts"

/**
 * The arms as rigid mechanical segments: shoulder ball, upper arm and its band on the upper-arm
 * joint; elbow ball, forearm with an outward accent strip, cuff, mitten, thumb and knuckle seam on
 * the forearm joint. Each segment is oriented along its bone in the bind pose.
 */
export function emitArms(body: BodyBuilder): void {
  const arms: [string, string][] = [
    ["arm.L", "lower.arm.L"],
    ["arm.R", "lower.arm.R"],
  ]
  for (const [upperName, lowerName] of arms) {
    const shoulder = body.jointFrame(upperName).position
    const elbow = body.jointFrame(lowerName).position
    const upperAxis = normalizeVector(subtractVectors(elbow, shoulder))
    const forearmAxis = body.jointFrame(lowerName).axisY
    const upperLength = vectorLength(subtractVectors(elbow, shoulder))
    const sideSign = shoulder[0] > 0 ? 1 : -1
    const upperSide = normalizeVector(crossProduct(upperAxis, [0, 0, 1]))
    const upperFront = crossProduct(upperSide, upperAxis)
    const forearmSide = normalizeVector(crossProduct(forearmAxis, [0, 0, 1]))
    const forearmFront = crossProduct(forearmSide, forearmAxis)
    const outward = scaleVector(forearmSide, dotProduct(forearmSide, [sideSign, 0, 0]) > 0 ? 1 : -1)
    const upperArm = body.rigid(upperName)
    const forearm = body.rigid(lowerName)
    const alongForearm = (distance: number) => addVectors(elbow, scaleVector(forearmAxis, distance))
    body.emit("metal", body.ellipsoid(shoulder, [0.05, 0.05, 0.05], 10, 18), upperArm)
    body.emit(
      "primary",
      body.orientedSuperEllipsoid(
        addVectors(shoulder, scaleVector(upperAxis, upperLength * 0.52)),
        [0.042, upperLength * 0.42, 0.042],
        0.3,
        upperSide,
        upperAxis,
        upperFront,
      ),
      upperArm,
    )
    if (!body.lite) {
      body.emit(
        "secondary",
        body.orientedSuperEllipsoid(
          addVectors(shoulder, scaleVector(upperAxis, upperLength * 0.62)),
          [0.047, 0.009, 0.047],
          0.3,
          upperSide,
          upperAxis,
          upperFront,
          4,
          16,
        ),
        upperArm,
      )
    }
    body.emit("metal", body.ellipsoid(elbow, [0.04, 0.04, 0.04], 8, 16), forearm)
    body.emit(
      "primary",
      body.orientedSuperEllipsoid(
        alongForearm(0.072),
        [0.048, 0.058, 0.048],
        0.3,
        forearmSide,
        forearmAxis,
        forearmFront,
      ),
      forearm,
    )
    body.emit(
      "accent",
      body.orientedSuperEllipsoid(
        addVectors(alongForearm(0.072), scaleVector(outward, 0.048)),
        [0.004, 0.034, 0.013],
        0.5,
        forearmSide,
        forearmAxis,
        forearmFront,
        4,
        10,
      ),
      forearm,
    )
    if (!body.lite) {
      body.emit(
        "secondary",
        body.orientedSuperEllipsoid(
          alongForearm(0.132),
          [0.053, 0.012, 0.053],
          0.3,
          forearmSide,
          forearmAxis,
          forearmFront,
          4,
          16,
        ),
        forearm,
      )
    }
    body.emit(
      "secondary",
      body.orientedSuperEllipsoid(
        alongForearm(0.185),
        [0.05, 0.046, 0.04],
        0.4,
        forearmSide,
        forearmAxis,
        forearmFront,
      ),
      forearm,
    )
    body.emit(
      "secondary",
      body.orientedSuperEllipsoid(
        addVectors(alongForearm(0.168), scaleVector(forearmFront, 0.042)),
        [0.017, 0.026, 0.017],
        0.45,
        forearmSide,
        forearmAxis,
        forearmFront,
        6,
        12,
      ),
      forearm,
    )
    if (!body.lite) {
      body.emit(
        "metal",
        body.orientedSuperEllipsoid(
          alongForearm(0.2),
          [0.051, 0.004, 0.041],
          0.4,
          forearmSide,
          forearmAxis,
          forearmFront,
          4,
          12,
        ),
        forearm,
      )
    }
  }
}
