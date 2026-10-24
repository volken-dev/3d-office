import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js"
import * as THREE from "three/webgpu"
import { easeColorToward } from "../color-easing"
import { isMesh, isSkinnedMesh, isStandardMaterial } from "../scene-graph-guards"
import { ThreeActor } from "./three-actor"

/** The material the status colour is painted on, per the asset contract. */
const STATUS_MATERIAL = "primary"

/** The loaded robot every rig is cloned from: its scene and its clips. */
export interface RobotTemplate {
  scene: THREE.Object3D
  animations: readonly THREE.AnimationClip[]
}

/**
 * One robot in the office: a skeleton-aware clone of the loaded robot with its own mixer playing
 * the shared clips (body, antenna and the face's morph weights alike) and its own copy of the
 * `primary` material, whose colour eases to the robot's status colour. Geometry and the other
 * materials stay shared with the template, which owns them.
 */
export class RobotRig {
  public readonly root: THREE.Object3D
  public readonly actor: ThreeActor
  private readonly mixer: THREE.AnimationMixer
  private readonly statusMaterial: THREE.MeshStandardMaterial | null
  private readonly defaultColor = new THREE.Color()
  private readonly currentColor = new THREE.Color()
  private readonly targetColor = new THREE.Color()
  private isDisposed = false

  constructor(template: RobotTemplate) {
    this.root = cloneSkinned(template.scene)
    this.statusMaterial = this.prepareMeshes()
    if (this.statusMaterial) this.defaultColor.copy(this.statusMaterial.color)
    this.currentColor.copy(this.defaultColor)
    this.targetColor.copy(this.defaultColor)
    this.mixer = new THREE.AnimationMixer(this.root)
    this.actor = new ThreeActor(this.root, this.mixer, template.animations)
  }

  /** The colour the robot's body is easing toward. */
  public get statusColor(): THREE.Color {
    return this.targetColor
  }

  /** Sets the status colour the body eases to: `#rrggbb`, or null for the robot's own grey. */
  public setStatusColor(hex: string | null): void {
    if (hex === null) this.targetColor.copy(this.defaultColor)
    else this.targetColor.set(hex)
  }

  /** Advances the robot's animation and colour by a frame. */
  public update(deltaSeconds: number): void {
    if (this.isDisposed) return
    this.mixer.update(deltaSeconds)
    if (this.statusMaterial && easeColorToward(this.currentColor, this.targetColor, deltaSeconds)) {
      this.statusMaterial.color.copy(this.currentColor)
    }
  }

  /** Stops the mixer, frees what this robot owns (its material copy, its skeletons) and detaches it. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.statusMaterial?.dispose()
    this.root.traverse((node) => {
      if (isSkinnedMesh(node)) node.skeleton.dispose()
    })
    this.root.removeFromParent()
  }

  /**
   * Shadows on, culling off (a skinned mesh's bounds are its bind pose, so an animated robot
   * would vanish at the screen edge), and one shared copy of `primary` for this robot.
   */
  private prepareMeshes(): THREE.MeshStandardMaterial | null {
    let statusMaterial: THREE.MeshStandardMaterial | null = null
    this.root.traverse((node) => {
      if (!isMesh(node)) return
      node.castShadow = true
      node.receiveShadow = true
      node.frustumCulled = false
      const material = node.material
      if (Array.isArray(material) || material.name !== STATUS_MATERIAL) return
      if (!isStandardMaterial(material)) return
      statusMaterial ??= material.clone()
      node.material = statusMaterial
    })
    return statusMaterial
  }
}
