import { lerp } from "../scalar-easing.ts"
import type { ReadonlyVector3 } from "../vector3.ts"
import { gridPart, type MeshPart } from "./mesh-part.ts"
import { scaledSegments, type Tessellation } from "./tessellation.ts"

/** One ring of a loft: height, centre x and z, and radii along x and z. */
type LoftRing = [number, number, number, number, number]

/** A surface of revolution through horizontal elliptical rings, bottom to top. */
function loft(tessellation: Tessellation, rings: LoftRing[], sides: number): MeshPart {
  const sideCount = scaledSegments(tessellation, sides)
  return gridPart(rings.length, sideCount, (ringIndex, side) => {
    const [height, centerX, centerZ, radiusX, radiusZ] = rings[ringIndex]
    const angle = (2 * Math.PI * side) / sideCount
    return [centerX + radiusX * Math.cos(angle), height, centerZ + radiusZ * Math.sin(angle)]
  })
}

/** An axis-aligned ellipsoid lofted pole to pole. Ring and side counts follow the mesh density. */
export function ellipsoid(
  tessellation: Tessellation,
  center: ReadonlyVector3,
  radii: ReadonlyVector3,
  rings = 16,
  sides = 28,
): MeshPart {
  const ringCount = scaledSegments(tessellation, rings)
  const lofted: LoftRing[] = []
  for (let ring = 0; ring < ringCount; ring++) {
    const latitude = lerp(-Math.PI / 2, Math.PI / 2, ring / (ringCount - 1))
    const ringScale = Math.cos(latitude)
    lofted.push([
      center[1] + radii[1] * Math.sin(latitude),
      center[0],
      center[2],
      radii[0] * ringScale,
      radii[2] * ringScale,
    ])
  }
  return loft(tessellation, lofted, sides)
}
