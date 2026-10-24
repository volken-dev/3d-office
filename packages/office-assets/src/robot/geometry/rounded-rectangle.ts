import type { Vector3 } from "../vector3.ts"

/**
 * The outline of a rounded rectangle in the plane `z`, counter-clockwise from the top-right
 * corner, `stepsPerCorner` + 1 points per corner arc. Used as a closed tube path (the face bezel).
 */
export function roundedRectanglePath(
  centerX: number,
  centerY: number,
  z: number,
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
  stepsPerCorner = 6,
): Vector3[] {
  const points: Vector3[] = []
  const corners: [number, number, number][] = [
    [halfWidth - cornerRadius, halfHeight - cornerRadius, 0],
    [-(halfWidth - cornerRadius), halfHeight - cornerRadius, 1],
    [-(halfWidth - cornerRadius), -(halfHeight - cornerRadius), 2],
    [halfWidth - cornerRadius, -(halfHeight - cornerRadius), 3],
  ]
  for (const [offsetX, offsetY, quadrant] of corners) {
    for (let step = 0; step <= stepsPerCorner; step++) {
      const angle = (Math.PI / 2) * (quadrant + step / stepsPerCorner)
      points.push([
        centerX + offsetX + cornerRadius * Math.cos(angle),
        centerY + offsetY + cornerRadius * Math.sin(angle),
        z,
      ])
    }
  }
  return points
}
