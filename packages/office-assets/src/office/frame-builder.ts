import {
  boxPart,
  curvedPanelPart,
  polygonPart,
  quadPart,
  ringPart,
  superEllipsoidPart,
  tubePart,
} from "./mesh-parts.ts"
import { nextInSequence, type OfficeBuildContext } from "./office-build-context.ts"
import type { FrameTransform } from "./office-geometry.ts"
import { superEllipsoidTessellation, tubeTessellation } from "./tessellation-level.ts"
import { degreesToRadians, type Vector2, type Vector3 } from "./vector-math.ts"

/**
 * Builds geometry in a local frame (a translation on the plan plus a yaw), composable: a child
 * frame is placed in its parent's. Everything a frame emits lands in its node (some methods take a
 * node override), and it can mark obstacles and POIs in world space.
 */
export class FrameBuilder {
  readonly context: OfficeBuildContext
  readonly node: string
  readonly originX: number
  readonly originZ: number
  readonly rotation: number
  readonly parent: FrameBuilder | null

  constructor(
    context: OfficeBuildContext,
    node: string,
    originX = 0,
    originZ = 0,
    rotation = 0,
    parent: FrameBuilder | null = null,
  ) {
    this.context = context
    this.node = node
    this.originX = originX
    this.originZ = originZ
    this.rotation = rotation
    this.parent = parent
  }

  /** A child frame at local (x, z), turned by `rotation` degrees, emitting into the same node. */
  child(x: number, z: number, rotation: number): FrameBuilder {
    return new FrameBuilder(this.context, this.node, x, z, rotation, this)
  }

  /** A frame that shares this one's placement but emits into another node. */
  inNode(node: string): FrameBuilder {
    return new FrameBuilder(this.context, node, 0, 0, 0, this)
  }

  /** A local point in world space. */
  point(position: Vector3): Vector3 {
    const cosine = Math.cos(degreesToRadians(this.rotation))
    const sine = Math.sin(degreesToRadians(this.rotation))
    const world: Vector3 = [
      position[0] * cosine + position[2] * sine + this.originX,
      position[1],
      -position[0] * sine + position[2] * cosine + this.originZ,
    ]
    return this.parent ? this.parent.point(world) : world
  }

  /** A local direction in world space. */
  direction(direction: Vector3): Vector3 {
    const cosine = Math.cos(degreesToRadians(this.rotation))
    const sine = Math.sin(degreesToRadians(this.rotation))
    const world: Vector3 = [
      direction[0] * cosine + direction[2] * sine,
      direction[1],
      -direction[0] * sine + direction[2] * cosine,
    ]
    return this.parent ? this.parent.direction(world) : world
  }

  /** The frame's total yaw in world space, in degrees. */
  worldRotation(): number {
    return this.rotation + (this.parent ? this.parent.worldRotation() : 0)
  }

  /** The frame as a transform for {@link OfficeGeometry.push}. */
  transform(): FrameTransform {
    return {
      point: (position) => this.point(position),
      normal: (normal) => this.direction(normal),
    }
  }

  /** An axis-aligned box (centre, full size); UVs in metres divided by `uvScale`. */
  box(material: string, center: Vector3, size: Vector3, uvScale = 1): this {
    this.context.geometry.push(
      this.node,
      material,
      boxPart(center, size, uvScale),
      this.transform(),
    )
    return this
  }

  /**
   * A super-ellipsoid (see {@link superEllipsoidPart}), tessellated by size; counted as a curved
   * mesh by the z-fighting check.
   */
  superEllipsoid(
    material: string,
    center: Vector3,
    half: Vector3,
    profileExponent: number,
    planExponent: number,
    rings: number,
    sides: number,
  ): this {
    const [cappedRings, cappedSides] = superEllipsoidTessellation(
      this.context.tessellateBySize,
      half,
      rings,
      sides,
    )
    this.context.geometry.push(
      this.node,
      material,
      superEllipsoidPart(center, half, profileExponent, planExponent, cappedRings, cappedSides),
      this.transform(),
      true,
    )
    return this
  }

  /** A tapered open tube, tessellated by size; counted as a curved mesh. */
  tube(
    material: string,
    start: Vector3,
    end: Vector3,
    startRadius: number,
    endRadius: number,
    sides: number,
  ): this {
    const cappedSides = tubeTessellation(
      this.context.tessellateBySize,
      Math.max(startRadius, endRadius),
      sides,
    )
    this.context.geometry.push(
      this.node,
      material,
      tubePart(start, end, startRadius, endRadius, cappedSides),
      this.transform(),
      true,
    )
    return this
  }

  /** An annular sector prism round the frame origin (see {@link ringPart}). */
  ring(
    material: string,
    innerRadius: number,
    outerRadius: number,
    bottom: number,
    top: number,
    startAngle: number,
    endAngle: number,
    segments: number,
  ): this {
    const part = ringPart({
      innerRadius,
      outerRadius,
      bottom,
      top,
      startAngle,
      endAngle,
      segments,
    })
    this.context.geometry.push(this.node, material, part, this.transform())
    return this
  }

  /** A quad from half-extent vectors, optionally into another node. */
  quad(
    material: string,
    center: Vector3,
    uHalf: Vector3,
    vHalf: Vector3,
    node: string = this.node,
  ): this {
    this.context.geometry.push(node, material, quadPart(center, uHalf, vHalf), this.transform())
    return this
  }

  /** A curved panel (see {@link curvedPanelPart}), optionally into another node. */
  curved(
    material: string,
    center: Vector3,
    width: number,
    height: number,
    radius: number,
    segments: number,
    node: string = this.node,
    back = 0,
  ): this {
    const part = curvedPanelPart(center, width, height, radius, segments, back)
    this.context.geometry.push(node, material, part, this.transform())
    return this
  }

  /** A flat convex polygon at height `y`, facing up. */
  polygon(material: string, points: Vector2[], y: number): this {
    this.context.geometry.push(this.node, material, polygonPart(points, y), this.transform())
    return this
  }

  /** A flat rectangle at height `y`, facing up. */
  rectangle(material: string, x0: number, z0: number, x1: number, z1: number, y: number): this {
    return this.polygon(
      material,
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
      y,
    )
  }

  /**
   * A painted frame: lines `lineWidth` wide centred on the rectangle's edges, the long sides
   * between the short ones so no two strips overlap.
   */
  outline(
    material: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    lineWidth: number,
    y: number,
  ): this {
    const half = lineWidth / 2
    this.rectangle(material, x0 - half, z0 - half, x1 + half, z0 + half, y).rectangle(
      material,
      x0 - half,
      z1 - half,
      x1 + half,
      z1 + half,
      y,
    )
    return this.rectangle(material, x0 - half, z0 + half, x0 + half, z1 - half, y).rectangle(
      material,
      x1 - half,
      z0 + half,
      x1 + half,
      z1 - half,
      y,
    )
  }

  /**
   * Marks a local rectangle as an obstacle on the walk grid. In a frame turned by other than a
   * multiple of 90 degrees it stays an oriented rectangle (a polygon).
   */
  block(x0: number, z0: number, x1: number, z1: number): this {
    const corners: Vector3[] = [
      [x0, 0, z0],
      [x1, 0, z0],
      [x1, 0, z1],
      [x0, 0, z1],
    ]
    const points = corners.map((corner) => this.point(corner))
    if (Math.abs(this.worldRotation() % 90) > 1e-6) {
      this.context.obstacles.push({
        kind: "polygon",
        points: points.map((point) => [point[0], point[2]]),
      })
      return this
    }
    this.context.obstacles.push({
      kind: "rectangle",
      minX: Math.min(...points.map((point) => point[0])),
      minZ: Math.min(...points.map((point) => point[2])),
      maxX: Math.max(...points.map((point) => point[0])),
      maxZ: Math.max(...points.map((point) => point[2])),
    })
    return this
  }

  /**
   * Places POI `poi-<kind>-<id>` at local (x, z), facing `rotation` degrees in this frame. Without
   * an id it takes the kind's next running number.
   */
  pointOfInterest(kind: string, id: number | null, x: number, z: number, rotation: number): this {
    const position = this.point([x, 0, z])
    const number = id ?? nextInSequence(this.context, kind)
    this.context.pointsOfInterest.push({
      name: `poi-${kind}-${number}`,
      position: [position[0], 0.0025, position[2]],
      rotation: this.worldRotation() + rotation,
    })
    return this
  }
}
