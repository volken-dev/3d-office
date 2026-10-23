import * as THREE from "three/webgpu"
import type { CharacterController } from "../character-controller"
import type { CharacterStateKey, IAgentDriver } from "../scene-types"

/**
 * PlayerInputDriver — translates user input into CharacterController actions.
 *
 * This is the only driver that listens to human input. It does NOT contain
 * any animation or expression logic; it just calls controller.moveTo(),
 * controller.play(), etc. in response to user gestures.
 *
 * SceneManager forwards InputManager clicks to it.
 */
export class PlayerInputDriver implements IAgentDriver {
  public readonly agentIndex: number

  constructor(
    agentIndex: number,
    private readonly controller: CharacterController,
  ) {
    this.agentIndex = agentIndex
  }

  /** User clicked on the floor: walk the player to that position. */
  public onFloorClick(x: number, z: number): void {
    const target = new THREE.Vector3(x, 0, z)
    const from = this._getCurrentPosition()
    this.controller.moveTo(this.agentIndex, target, "idle", undefined, from)
  }

  /** User clicked on a POI (e.g. chair): walk to and interact. */
  public onPoiClick(id: string): void {
    const from = this._getCurrentPosition()
    this.controller.walkToPoi(this.agentIndex, id, undefined, from)
  }

  /**
   * Walk the player toward a specific world position with a custom arrival state.
   * Used by SceneManager when the player initiates a chat with an NPC.
   */
  public walkTo(
    target: THREE.Vector3,
    arrivalState: CharacterStateKey = "idle",
    onArrival?: (index: number) => void,
  ): void {
    const from = this._getCurrentPosition()
    this.controller.moveTo(this.agentIndex, target, arrivalState, onArrival, from)
  }

  private _getCurrentPosition(): THREE.Vector3 | undefined {
    const position = new THREE.Vector3()
    return this.controller.getCPUPosition(this.agentIndex, position) ? position : undefined
  }

  public update(): void {}

  public dispose(): void {}
}
