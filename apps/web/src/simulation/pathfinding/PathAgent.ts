import * as THREE from "three/webgpu"
import type { AgentStateBuffer } from "../behavior/AgentStateBuffer"
import { PATH_NODE_ARRIVAL } from "../constants"

/** Squared XZ distance under which the start position counts as already on the first node. */
const SAME_POINT_DISTANCE_SQUARED = 0.0001

/**
 * Manages path-following for a single agent on the CPU side.
 *
 * The movement step (behavior/characterMovement.ts) walks toward the current waypoint;
 * PathAgent decides *which* waypoint to set next as the agent progresses
 * along its path.
 */
export class PathAgent {
  private path: THREE.Vector3[] = []
  private nodeIndex = 0
  public isMoving = false

  constructor(
    private readonly agentIndex: number,
    private readonly stateBuffer: AgentStateBuffer,
  ) {}

  /**
   * Start following a new path. Immediately writes the first waypoint to the agent state buffer. When the
   * start position is not already on the first node it is prepended to the path, and following
   * begins at the first real node.
   */
  public setPath(path: THREE.Vector3[], fromPosition?: THREE.Vector3): void {
    this.path = path
    let prepended = false
    if (fromPosition && path.length > 0) {
      const firstNode = path[0]
      const distanceSquared =
        (firstNode.x - fromPosition.x) ** 2 + (firstNode.z - fromPosition.z) ** 2
      if (distanceSquared > SAME_POINT_DISTANCE_SQUARED) {
        this.path = [fromPosition, ...path]
        prepended = true
      }
    }
    this.nodeIndex = 0
    this.isMoving = this.path.length > 0
    if (this.isMoving) {
      if (prepended && this.path.length > 1) {
        this.nodeIndex = 1
      }
      this._writeWaypoint(this.path[this.nodeIndex])
    }
  }

  /** Cancel the current path. The agent will keep its last waypoint but stop following. */
  public cancel(): void {
    this.path = []
    this.nodeIndex = 0
    this.isMoving = false
  }

  /**
   * Advances to the next path node once the agent (at x, z) is close enough to the current one.
   * @returns true when the agent has reached the final destination.
   */
  public update(x: number, z: number): boolean {
    if (!this.isMoving || this.path.length === 0) return false

    const target = this.path[this.nodeIndex]
    const deltaX = target.x - x
    const deltaZ = target.z - z
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ

    if (distanceSquared < PATH_NODE_ARRIVAL * PATH_NODE_ARRIVAL) {
      this.nodeIndex++
      if (this.nodeIndex >= this.path.length) {
        this.isMoving = false
        return true
      }
      this._writeWaypoint(this.path[this.nodeIndex])
    }

    return false
  }

  /** Returns the last direction vector of the current path. */
  public getLastDirection(): THREE.Vector3 {
    if (this.path.length < 2) return new THREE.Vector3(0, 0, 1)
    const last = this.path[this.path.length - 1]
    const previous = this.path[this.path.length - 2]
    return new THREE.Vector3().subVectors(last, previous).normalize()
  }

  private _writeWaypoint(node: THREE.Vector3): void {
    this.stateBuffer.setWaypoint(this.agentIndex, node.x, node.z)
  }
}
