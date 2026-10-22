import type { AgenticSystem } from "@the-delegation/agents/team"
import * as THREE from "three/webgpu"
import {
  AgentBehavior,
  type AnimationName,
  type CharacterStateKey,
  type ExpressionKey,
  type ICharacterDriver,
} from "../types"

import type { AgentStateBuffer } from "./behavior/AgentStateBuffer"
import { CharacterStateMachine } from "./behavior/CharacterStateMachine"
import type { CharacterManager } from "./entities/CharacterManager"
import type { NavMeshManager } from "./pathfinding/NavMeshManager"
import { PathAgent } from "./pathfinding/PathAgent"
import type { PoiManager } from "./world/PoiManager"

const ORIGIN = new THREE.Vector3(0, 0, 0)

/**
 * CharacterController — unified API for controlling any character (player or NPC).
 *
 * Composes:
 *  - CharacterManager     → GPU rendering, animation baking, expression buffers
 *  - CharacterStateMachine → declarative state→animation+expression mapping
 *  - PathAgent[]          → per-agent CPU path following
 *  - NavMeshManager       → path queries
 *  - PoiManager           → POI lookup and occupancy
 *
 * Implements ICharacterDriver so it can be passed to the state machine and
 * behavior drivers without circular dependencies.
 *
 * All behavior code (PlayerInputDriver, NpcAgentDriver) goes through this class.
 */
export class CharacterController implements ICharacterDriver {
  private stateMachine!: CharacterStateMachine
  private pathAgents: PathAgent[] = []
  /** Per-agent callback fired when the agent reaches its path destination. */
  private arrivalCallbacks: ((index: number) => void)[] = []

  constructor(
    public readonly characterManager: CharacterManager,
    private readonly navMesh: NavMeshManager,
    public readonly poiManager: PoiManager,
    private playerIndex: number,
  ) {
    this.resetAgents()
  }

  /**
   * Fresh state machine and path followers sized to the current character count. Needs the
   * characters to be loaded, since path followers write into their state buffer.
   */
  private resetAgents(): void {
    const count = this.characterManager.getCount()
    const stateBuffer = this.characterManager.getAgentStateBuffer()
    if (!stateBuffer) throw new Error("CharacterController needs loaded characters")
    this.stateMachine = new CharacterStateMachine(count)
    this.pathAgents = []
    this.arrivalCallbacks = []
    for (let agentIndex = 0; agentIndex < count; agentIndex++) {
      this.pathAgents.push(new PathAgent(agentIndex, stateBuffer))
    }
  }

  /**
   * Transition a character to the given state.
   * The state machine applies the correct animation + expression automatically.
   * Non-interruptible states (e.g. 'sit_down') will queue the new state until ready.
   * Leaving a seated state releases the character's POIs.
   */
  public play(index: number, state: CharacterStateKey): void {
    const currentState = this.stateMachine.getState(index)
    const isCurrentlySeated =
      currentState === "sit_idle" || currentState === "sit_work" || currentState === "sit_down"
    const isNewStateSeated = state === "sit_idle" || state === "sit_work" || state === "sit_down"

    if (isCurrentlySeated && !isNewStateSeated) {
      this.poiManager.releaseAll(index)
    }

    this.stateMachine.transition(index, state, this)
  }

  /**
   * Walk a character to a world-space position using the navmesh.
   * Automatically transitions to 'walk' and then to `arrivalState` on arrival.
   * The path's last node is replaced by the exact target, not the nearest navmesh polygon
   * boundary. The player can end up just off the navmesh, where no path exists; it is teleported
   * rather than ignoring the click.
   *
   * @param arrivalState State to enter upon reaching the destination (default: 'idle')
   * @param onArrival    Optional callback fired when the destination is reached
   * @param fromPosition Optional start position (defaults to current CPU position)
   * @param targetOrientation Optional orientation to snap to upon arrival
   */
  public moveTo(
    index: number,
    target: THREE.Vector3,
    arrivalState: CharacterStateKey = "idle",
    onArrival?: (index: number) => void,
    fromPosition?: THREE.Vector3,
    targetOrientation?: THREE.Quaternion,
  ): boolean {
    let from: THREE.Vector3

    if (fromPosition) {
      from = fromPosition.clone()
    } else {
      const positions = this.characterManager.getCPUPositions()
      if (!positions) return false

      from = new THREE.Vector3(
        positions[index * 4],
        positions[index * 4 + 1],
        positions[index * 4 + 2],
      )
    }

    const path = this.navMesh.findPath(from, target)

    if (path.length === 0) {
      if (index === this.playerIndex) {
        this.characterManager.setPosition(index, target)
        if (targetOrientation) {
          this.characterManager.setOrientation(index, targetOrientation)
        }
        this.play(index, arrivalState)
        onArrival?.(index)
        return true
      }

      return false
    }

    path[path.length - 1] = target.clone()

    this.pathAgents[index].setPath(path, from)
    this.arrivalCallbacks[index] = (arrivedIndex) => {
      if (targetOrientation) {
        this.characterManager.setOrientation(arrivedIndex, targetOrientation)
      }
      this.play(arrivedIndex, arrivalState)
      onArrival?.(arrivedIndex)
    }

    this.setPhysicsMode(index, AgentBehavior.GOTO)
    this.play(index, "walk")

    return true
  }

  /**
   * Walk a character to a POI by ID.
   * Occupies the POI immediately; releases existing ones first, but only once a path exists.
   *
   * A sit target is armed before walking, so when the sit_down timer expires the state machine
   * reads it directly, immune to the async gap between syncFromGPU and stateMachine.update. On
   * arrival the character snaps to the exact POI position (removing any navmesh offset) and, except
   * for 'area' POIs, its facing; seated arrivals switch the GPU to SEATED so a stray GOTO can't move
   * them.
   */
  public walkToPoi(
    index: number,
    poiId: string,
    onArrival?: (index: number) => void,
    fromPosition?: THREE.Vector3,
  ): boolean {
    const poi = this.poiManager.getPoi(poiId)
    if (!poi || (poi.occupiedBy !== null && poi.occupiedBy !== index)) return false

    const targetState = poi.arrivalState
    const isSitVariant = targetState === "sit_idle" || targetState === "sit_work"

    if (isSitVariant) {
      this.stateMachine.prepareSitDown(index, targetState)
    }

    const moved = this.moveTo(
      index,
      poi.position,
      "idle",
      (arrivedIndex) => {
        this.characterManager.setPosition(arrivedIndex, poi.position)

        if (!poi.id.startsWith("area")) {
          this.characterManager.setOrientation(arrivedIndex, poi.quaternion)
        }

        if (isSitVariant) {
          this.setPhysicsMode(arrivedIndex, AgentBehavior.SEATED)
          this.play(arrivedIndex, "sit_down")
        } else {
          this.play(arrivedIndex, targetState)
        }

        onArrival?.(arrivedIndex)
      },
      fromPosition,
    )

    if (!moved) return false

    this.poiManager.releaseAll(index)
    this.poiManager.occupy(poiId, index)

    return true
  }

  /** Speaking mouth animation overlay — independent of character state. */
  public setSpeaking(index: number, isSpeaking: boolean): void {
    this.characterManager.setSpeaking(index, isSpeaking)
  }

  public getState(index: number): CharacterStateKey {
    return this.stateMachine.getState(index)
  }

  /** Once per frame: expressions and the movement compute pass on the GPU, then state machine timers. */
  public update(deltaSeconds: number, renderer: THREE.WebGPURenderer): void {
    this.characterManager.update(deltaSeconds, renderer)
    this.stateMachine.update(deltaSeconds, this)
  }

  /** GPU→CPU position readback (async, about one frame behind). */
  public async syncFromGPU(renderer: THREE.WebGPURenderer): Promise<Float32Array | null> {
    return this.characterManager.syncFromGPU(renderer)
  }

  /**
   * Advance path agents. Call after syncFromGPU resolves so positions are fresh.
   * Fires arrival callbacks for agents that reach their destination, after keeping their last
   * movement direction as the IDLE facing.
   */
  public updatePaths(positions: Float32Array): void {
    for (let agentIndex = 0; agentIndex < this.pathAgents.length; agentIndex++) {
      const pathAgent = this.pathAgents[agentIndex]
      if (!pathAgent.isMoving) continue

      const arrived = pathAgent.update(positions[agentIndex * 4], positions[agentIndex * 4 + 2])
      if (arrived) {
        const lastDirection = pathAgent.getLastDirection()
        this.characterManager.setFacing(agentIndex, lastDirection.x, lastDirection.z)

        this.setPhysicsMode(agentIndex, AgentBehavior.IDLE)
        this.arrivalCallbacks[agentIndex]?.(agentIndex)
      }
    }
  }

  /** Cancel movement for an agent and return to idle. */
  public cancelMovement(index: number): void {
    this.pathAgents[index].cancel()
    this.setPhysicsMode(index, AgentBehavior.IDLE)
  }

  /**
   * Instantly teleport every agent to their original spawn POI — no pathfinding,
   * no arrival callbacks. All POIs are released and in-flight paths cancelled first; spawn POIs
   * are then reassigned in sorted ID order, mirroring the order used during initialisation.
   *
   * @param playerIndex  Index of the player character (teleported to world origin).
   * @param npcIndices   Indices of all NPC agents, in the desired spawn-assignment order.
   */
  public warpAllToSpawn(playerIndex: number, npcIndices: number[]): void {
    this.poiManager.releaseAll(playerIndex)
    for (const npcIndex of npcIndices) this.poiManager.releaseAll(npcIndex)

    this.cancelMovement(playerIndex)
    for (const npcIndex of npcIndices) this.cancelMovement(npcIndex)

    this.characterManager.setPosition(playerIndex, ORIGIN)
    this.play(playerIndex, "idle")

    const spawnPois = this.poiManager.getPoisByPrefix("spawn")
    npcIndices.forEach((agentIndex, order) => {
      const poi = spawnPois[order % spawnPois.length]
      if (poi) {
        this.characterManager.setPosition(agentIndex, poi.position)
        this.characterManager.setOrientation(agentIndex, poi.quaternion)
        this.poiManager.occupy(poi.id, agentIndex)
      }
      this.play(agentIndex, "idle")
    })
  }

  public getCPUPositions(): Float32Array | null {
    return this.characterManager.getCPUPositions()
  }

  public getCPUPosition(index: number, out: THREE.Vector3): boolean {
    return this.characterManager.getCPUPosition(index, out)
  }

  public getCount(): number {
    return this.characterManager.getCount()
  }

  public getAgentStateBuffer(): AgentStateBuffer | null {
    return this.characterManager.getAgentStateBuffer()
  }

  /** Switches to another team's characters (one rebuild at most) and resets every character's state. */
  public setTeam(team: AgenticSystem): void {
    this.characterManager.setTeam(team)
    this.playerIndex = team.user.index
    this.resetAgents()
  }

  public setPhysicsMode(index: number, mode: AgentBehavior): void {
    this.characterManager.setPhysicsMode(index, mode)
  }

  public setAnimation(index: number, name: AnimationName, loop: boolean = true): void {
    this.characterManager.setAnimation(index, name, loop)
  }

  public setExpression(index: number, key: ExpressionKey): void {
    this.characterManager.setExpression(index, key)
  }

  public getAgentState(index: number): AgentBehavior {
    return this.characterManager.getAgentState(index)
  }

  public getAnimationDuration(name: AnimationName): number {
    return this.characterManager.getAnimationDuration(name)
  }
}
