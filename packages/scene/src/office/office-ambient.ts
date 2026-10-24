import * as THREE from "three/webgpu"

/**
 * The office's own animation (`Ambient`: conveyor, factory arms, rack shuttles, coolant vapour),
 * looped on one mixer. Every loop in the clip is authored seamless, so it never visibly restarts.
 */
export class OfficeAmbient {
  private readonly mixer: THREE.AnimationMixer
  private isDisposed = false

  constructor(
    private readonly root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
  ) {
    this.mixer = new THREE.AnimationMixer(root)
    for (const clip of clips) this.mixer.clipAction(clip).play()
  }

  /** Advances the loop by a frame. */
  public update(deltaSeconds: number): void {
    if (!this.isDisposed) this.mixer.update(deltaSeconds)
  }

  /** Stops the loop and drops the mixer's cached bindings. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
  }
}
