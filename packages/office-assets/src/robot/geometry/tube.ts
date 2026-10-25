import {
  addVectors,
  crossProduct,
  dotProduct,
  normalizeVector,
  type ReadonlyVector3,
  scaleVector,
  subtractVectors,
  type Vector3,
  vectorLength,
} from "../vector3.ts"
import { gridPart, type MeshPart } from "./mesh-part.ts"
import { scaledSegments, type Tessellation } from "./tessellation.ts"

/** A tube radius: constant, or a function of the fraction along the path (0 to 1). */
export type TubeRadius = number | ((fraction: number) => number)

/** Options for {@link tube}. */
export interface TubeOptions {
  /** Joins the end back to the start (a ring), with no caps. */
  closed?: boolean
  /**
   * For closed tubes: the ring's centre. Each cross-section's normal then points away from it,
   * which keeps the frame from twisting round a loop.
   */
  center?: ReadonlyVector3 | null
  /** Rings in each rounded end cap. Default 4, or 2 for lite. */
  capSteps?: number
  /** Round the two ends off with hemispherical caps (open tubes only). */
  caps?: boolean
}

interface PathSample {
  position: Vector3
  radius: number
}

interface CrossSection {
  position: Vector3
  normal: Vector3
  binormal: Vector3
  radius: number
}

/**
 * Inserts points along each segment of `path` so no step is longer than `step` (three times
 * longer for lite).
 */
export function densifyPath(
  tessellation: Tessellation,
  path: readonly Vector3[],
  step: number,
): Vector3[] {
  const effectiveStep = tessellation.lite ? step * 3 : step
  const densified: Vector3[] = [path[0]]
  for (let index = 1; index < path.length; index++) {
    const segment = subtractVectors(path[index], path[index - 1])
    const pieces = Math.max(1, Math.ceil(vectorLength(segment) / effectiveStep))
    for (let piece = 1; piece <= pieces; piece++) {
      densified.push(
        addVectors(
          path[index - 1],
          scaleVector(subtractVectors(path[index], path[index - 1]), piece / pieces),
        ),
      )
    }
  }
  return densified
}

/** Adds hemispherical caps at both ends of an open path: rings that shrink as they step outward. */
function withRoundCaps(samples: PathSample[], capSteps: number): PathSample[] {
  const first = samples[0]
  const last = samples[samples.length - 1]
  const startTangent = normalizeVector(subtractVectors(samples[1].position, first.position))
  const endTangent = normalizeVector(
    subtractVectors(last.position, samples[samples.length - 2].position),
  )
  const head: PathSample[] = []
  const tail: PathSample[] = []
  for (let step = capSteps; step >= 1; step--) {
    const capAngle = (Math.PI / 2) * (step / capSteps)
    head.push({
      position: subtractVectors(
        first.position,
        scaleVector(startTangent, first.radius * Math.sin(capAngle)),
      ),
      radius: first.radius * Math.cos(capAngle),
    })
    tail.unshift({
      position: addVectors(
        last.position,
        scaleVector(endTangent, last.radius * Math.sin(capAngle)),
      ),
      radius: last.radius * Math.cos(capAngle),
    })
  }
  return [...head, ...samples, ...tail]
}

/**
 * Builds a cross-section frame per sample with a parallel-transport normal (or, for a closed tube
 * with a centre, a normal pointing away from that centre).
 */
function crossSections(
  samples: PathSample[],
  closed: boolean,
  center: ReadonlyVector3 | null,
): CrossSection[] {
  const count = samples.length
  const sections: CrossSection[] = []
  let normal: Vector3 | null = null
  for (let index = 0; index < count; index++) {
    const behind = samples[Math.max(0, index - 1)].position
    const ahead = samples[Math.min(count - 1, index + 1)].position
    let tangent = normalizeVector(subtractVectors(ahead, behind))
    if (closed && (index === 0 || index === count - 1)) {
      tangent = normalizeVector(subtractVectors(samples[1].position, samples[count - 2].position))
    }
    if (closed && center) {
      const outward = subtractVectors(samples[index].position, center)
      normal = normalizeVector(
        subtractVectors(outward, scaleVector(tangent, dotProduct(outward, tangent))),
      )
    } else if (normal === null) {
      const reference: Vector3 = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      normal = normalizeVector(crossProduct(tangent, reference))
    } else {
      normal = normalizeVector(
        subtractVectors(normal, scaleVector(tangent, dotProduct(normal, tangent))),
      )
    }
    sections.push({
      position: samples[index].position,
      normal,
      binormal: crossProduct(tangent, normal),
      radius: samples[index].radius,
    })
  }
  return sections
}

/**
 * A tube along `path`, round-capped unless closed or `caps` is false. Side count is 6 for lite,
 * at least 8 otherwise, and follows the mesh density above that.
 */
export function tube(
  tessellation: Tessellation,
  path: readonly Vector3[],
  radius: TubeRadius,
  sides = 14,
  options: TubeOptions = {},
): MeshPart {
  const closed = options.closed ?? false
  const center = options.center ?? null
  const capSteps = options.capSteps ?? (tessellation.lite ? 2 : 4)
  const caps = options.caps ?? true
  const sideCount = tessellation.lite ? 6 : sides <= 8 ? 8 : scaledSegments(tessellation, sides)
  const radiusAt = typeof radius === "function" ? radius : () => radius
  let samples: PathSample[] = path.map((position, index) => ({
    position,
    radius: radiusAt(path.length > 1 ? index / (path.length - 1) : 0),
  }))
  if (!closed && caps) samples = withRoundCaps(samples, capSteps)
  if (closed) samples.push({ ...samples[0] })
  const sections = crossSections(samples, closed, center)
  return gridPart(
    samples.length,
    sideCount,
    (row, side) => {
      const angle = (2 * Math.PI * side) / sideCount
      const section = sections[row]
      return addVectors(
        section.position,
        addVectors(
          scaleVector(section.normal, section.radius * Math.cos(angle)),
          scaleVector(section.binormal, section.radius * Math.sin(angle)),
        ),
      )
    },
    true,
  )
}
