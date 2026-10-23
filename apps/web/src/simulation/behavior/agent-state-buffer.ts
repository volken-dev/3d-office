import { Vec4Texture } from "../vec4-texture"

/**
 * CPU/GPU buffer that stores per-instance physics mode and animation state.
 *
 * Each instance maps to two vec4 records (8 floats total), at record 2 * index and 2 * index + 1.
 *
 * Record 0 (vec4):
 *   .x = facing X    (faced whenever the character is not moving fast enough to face its velocity)
 *   .y = animation   (animation index to play)
 *   .z = facing Z
 *   .w = mode        (0 = IDLE, 1 = GOTO, 2 = SEATED)
 *
 * Record 1 (vec4):
 *   .x = startTime   (global time when animation started)
 *   .y = loopMode    (1.0 = loop, 0.0 = clamp)
 *   .z = alpha       (1.0 = opaque, <1.0 = transparent)
 *   .w = (unused)
 *
 * The vertex shader reads the animation, the facing override and the alpha; the mode tells the rest
 * of the scene whether a character is walking or seated.
 */
export class AgentStateBuffer {
  /** Raw Float32Array (8 floats per instance), shared with `texture`. */
  public readonly array: Float32Array

  /** GPU copy, two vec4 records per instance. */
  public readonly texture: Vec4Texture

  constructor(count: number) {
    this.texture = new Vec4Texture(count * 2)
    this.array = this.texture.array
    for (let i = 0; i < count; i++) {
      this.array[i * 8 + 6] = 1.0
    }
  }

  public getState(index: number): number {
    return this.array[index * 8 + 3]
  }

  public setState(index: number, state: number): void {
    this.array[index * 8 + 3] = state
    this.texture.markChanged()
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
    this.texture.markChanged()
  }

  public setAlpha(index: number, alpha: number): void {
    this.array[index * 8 + 6] = alpha
    this.texture.markChanged()
  }

  public getAlpha(index: number): number {
    return this.array[index * 8 + 6]
  }

  /** The direction the character faces whenever it is not walking fast enough to face its velocity. */
  public setFacing(index: number, x: number, z: number): void {
    this.array[index * 8 + 0] = x
    this.array[index * 8 + 2] = z
    this.texture.markChanged()
  }

  public dispose(): void {
    this.texture.dispose()
  }
}
