import { type Actor, CROSSFADE_TIME, type PlayOptions } from "@the-delegation/office-sim/agent"
import * as THREE from "three/webgpu"

/**
 * office-sim's `Actor` port over a three.js robot: poses its root on the floor and plays its clips
 * on its mixer. Loops repeat; one-shots (Sit, Stand, Plug_In, Plug_Out) play once and hold their
 * last frame until the next clip fades in. A clip started with no fade (a robot placed or
 * spawned) cuts straight in, and a loop starts at a random time so robots placed together do not
 * move in step.
 */
export class ThreeActor implements Actor {
  private readonly clips: ReadonlyMap<string, THREE.AnimationClip>
  private currentAction: THREE.AnimationAction | null = null

  constructor(
    private readonly root: THREE.Object3D,
    private readonly mixer: THREE.AnimationMixer,
    clips: readonly THREE.AnimationClip[],
    private readonly random: () => number = Math.random,
  ) {
    this.clips = new Map(clips.map((clip) => [clip.name, clip]))
  }

  /** The action last started, for the rig and tests. */
  public get current(): THREE.AnimationAction | null {
    return this.currentAction
  }

  /** Puts the robot at a floor point facing `yaw` (0 faces +Z). */
  public setPose(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z)
    this.root.rotation.set(0, yaw, 0)
  }

  /** Starts a clip, crossfading from the current one over `fade` seconds. */
  public play(clipName: string, { once = false, fade = CROSSFADE_TIME }: PlayOptions): void {
    const clip = this.clips.get(clipName)
    if (!clip) {
      console.warn(`[ThreeActor] the robot has no clip named "${clipName}"`)
      return
    }
    const action = this.mixer.clipAction(clip)
    action.reset()
    if (once) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
      action.clampWhenFinished = false
    }
    if (fade > 0) {
      action.play()
      if (this.currentAction && this.currentAction !== action) {
        this.currentAction.crossFadeTo(action, fade, false)
      }
    } else {
      this.mixer.stopAllAction()
      action.time = once ? 0 : this.random() * clip.duration
      action.play()
    }
    this.currentAction = action
  }

  /** The clip's length in seconds; 0 for a clip the robot does not have. */
  public duration(clipName: string): number {
    return this.clips.get(clipName)?.duration ?? 0
  }
}
