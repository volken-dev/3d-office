import { storage } from "three/tsl"
import * as THREE from "three/webgpu"

/**
 * CPU/GPU buffer that stores per-instance physics mode and animation state.
 *
 * Each instance maps to two vec4s (8 floats total) per instance.
 *
 * Buffer 0 (vec4):
 *   .x = waypoint X  (used when mode == GOTO)
 *   .y = animation   (animation index to play)
 *   .z = waypoint Z  (used when mode == GOTO)
 *   .w = mode        (0 = IDLE, 1 = GOTO, 2 = SEATED)
 *
 * Buffer 1 (vec4):
 *   .x = startTime   (global time when animation started)
 *   .y = loopMode    (1.0 = loop, 0.0 = clamp)
 *   .z = alpha       (1.0 = opaque, <1.0 = transparent)
 *   .w = (unused)
 *
 * CPU writes metadata, GPU shader reads them.
 */
export class AgentStateBuffer {
  /** Raw Float32Array (8 floats per instance). */
  public readonly array: Float32Array

  /** GPU buffer attribute. */
  public readonly attribute: THREE.StorageInstancedBufferAttribute

  /** TSL storage node, two vec4 elements per instance. */
  public readonly storageNode: THREE.StorageBufferNode<"vec4">

  constructor(count: number) {
    this.array = new Float32Array(count * 8)
    for (let i = 0; i < count; i++) {
      this.array[i * 8 + 6] = 1.0
    }
    this.attribute = new THREE.StorageInstancedBufferAttribute(this.array, 8)
    this.storageNode = storage(this.attribute, "vec4", count * 2)
  }

  public getState(index: number): number {
    return this.array[index * 8 + 3]
  }

  public setState(index: number, state: number): void {
    this.array[index * 8 + 3] = state
    this.attribute.needsUpdate = true
  }

  public setAnimation(
    index: number,
    animationIndex: number,
    loop: boolean = true,
    startTime: number = 0,
  ): void {
    this.array[index * 8 + 1] = animationIndex
    this.array[index * 8 + 4] = startTime
    this.array[index * 8 + 5] = loop ? 1.0 : 0.0
    this.attribute.needsUpdate = true
  }

  public setAlpha(index: number, alpha: number): void {
    this.array[index * 8 + 6] = alpha
    this.attribute.needsUpdate = true
  }

  public getAlpha(index: number): number {
    return this.array[index * 8 + 6]
  }

  public setWaypoint(index: number, x: number, z: number): void {
    this.array[index * 8 + 0] = x
    this.array[index * 8 + 2] = z
    this.attribute.needsUpdate = true
  }

  /** Used when mode is IDLE to force a specific facing direction. */
  public setFacing(index: number, x: number, z: number): void {
    this.array[index * 8 + 0] = x
    this.array[index * 8 + 2] = z
    this.attribute.needsUpdate = true
  }
}
