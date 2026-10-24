import type { Node } from "@gltf-transform/core"
import { ellipsoid } from "../geometry/ellipsoid.ts"
import type { MeshAccumulator } from "../geometry/mesh-accumulator.ts"
import type { MeshPart } from "../geometry/mesh-part.ts"
import { rigidWeights, type WeightFunction } from "../geometry/skin-weights.ts"
import { orientedSuperEllipsoid, superEllipsoid } from "../geometry/super-ellipsoid.ts"
import type { Tessellation } from "../geometry/tessellation.ts"
import { densifyPath, type TubeOptions, type TubeRadius, tube } from "../geometry/tube.ts"
import type { MaterialName } from "../material-palette.ts"
import { type JointFrame, type JointIndices, jointIndex, jointWorldFrame } from "../rig-joints.ts"
import type { ReadonlyVector3, Vector3 } from "../vector3.ts"

/**
 * What every body-part module builds with: the shape kit bound to the build's tessellation, the
 * rig's joints, and emission into the `body` mesh. Vertices are authored in bind-pose world space.
 */
export class BodyBuilder {
  readonly tessellation: Tessellation
  private readonly accumulator: MeshAccumulator
  private readonly rigJoints: readonly Node[]
  private readonly indices: JointIndices

  constructor(
    accumulator: MeshAccumulator,
    tessellation: Tessellation,
    rigJoints: readonly Node[],
    indices: JointIndices,
  ) {
    this.accumulator = accumulator
    this.tessellation = tessellation
    this.rigJoints = rigJoints
    this.indices = indices
  }

  /** True for the crowd LOD, which skips small greebles. */
  get lite(): boolean {
    return this.tessellation.lite
  }

  /** Adds a part to the `body` mesh. */
  emit(material: MaterialName, part: MeshPart, weightsAt: WeightFunction): void {
    this.accumulator.emit("body", material, part, weightsAt)
  }

  /** Adds a part to another mesh group (the face). */
  emitToGroup(
    group: string,
    material: MaterialName,
    part: MeshPart,
    weightsAt: WeightFunction,
    keepDegenerate: boolean,
  ): void {
    this.accumulator.emit(group, material, part, weightsAt, keepDegenerate)
  }

  /** The skin index of joint `name`. */
  joint(name: string): number {
    return jointIndex(this.indices, name)
  }

  /** Binds every vertex fully to joint `name`. */
  rigid(name: string): WeightFunction {
    return rigidWeights(this.joint(name))
  }

  /** The bind-pose world frame of rig joint `name`. */
  jointFrame(name: string): JointFrame {
    return jointWorldFrame(this.rigJoints, this.indices, name)
  }

  /** See {@link superEllipsoid}. */
  superEllipsoid(
    center: ReadonlyVector3,
    halfExtents: ReadonlyVector3,
    exponent: number,
    rings?: number,
    sides?: number,
  ): MeshPart {
    return superEllipsoid(this.tessellation, center, halfExtents, exponent, rings, sides)
  }

  /** See {@link orientedSuperEllipsoid}. */
  orientedSuperEllipsoid(
    center: ReadonlyVector3,
    halfExtents: ReadonlyVector3,
    exponent: number,
    axisX: ReadonlyVector3,
    axisY: ReadonlyVector3,
    axisZ: ReadonlyVector3,
    rings?: number,
    sides?: number,
  ): MeshPart {
    return orientedSuperEllipsoid(
      this.tessellation,
      center,
      halfExtents,
      exponent,
      axisX,
      axisY,
      axisZ,
      rings,
      sides,
    )
  }

  /** See {@link ellipsoid}. */
  ellipsoid(
    center: ReadonlyVector3,
    radii: ReadonlyVector3,
    rings?: number,
    sides?: number,
  ): MeshPart {
    return ellipsoid(this.tessellation, center, radii, rings, sides)
  }

  /** See {@link tube}. */
  tube(
    path: readonly Vector3[],
    radius: TubeRadius,
    sides?: number,
    options?: TubeOptions,
  ): MeshPart {
    return tube(this.tessellation, path, radius, sides, options)
  }

  /** See {@link densifyPath}. */
  densify(path: readonly Vector3[], step: number): Vector3[] {
    return densifyPath(this.tessellation, path, step)
  }
}
