import type { AgenticSystem } from "@the-delegation/agents/team"
import * as THREE from "three/webgpu"
import {
  AgentBehavior,
  type AnimationName,
  type CharacterStateKey,
  type ExpressionKey,
  type ICharacterDriver,
} from "../types"

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
 *  - CharacterManager     → movement, GPU rendering, animation baking, expression buffers
 *  - CharacterStateMachine → declarative state→animation+expression mapping
 *  - PathAgent per agent   → CPU path following
 *  - NavMeshManager       → path queries
 *  - PoiManager           → POI lookup and occupancy
 *
 * Implements ICharacterDriver so it can be passed to the state machine and
 * behavior drivers without circular dependencies.
 *
 * All behavior code (PlayerInputDriver, NpcAgentDriver) goes through this class. Characters are
 * addressed by agent index; CharacterManager maps those to instance slots.
 */
export class CharacterController implements ICharacterDriver {
  private stateMachine!: CharacterStateMachine
  private pathAgents = new Map<number, PathAgent>()
  /** Per-agent callback fired when the agent reaches its path destination. */
  private arrivalCallbacks = new Map<number, (index: number) => void>()
  private readonly scratchPosition = new THREE.Vector3()

  constructor(
    public readonly characterManager: CharacterManager,
    private readonly navMesh: NavMeshManager,
    public readonly poiManager: PoiManager,
    private playerIndex: number,
  ) {
    this.resetAgents()
  }

  /** Fresh state machine and one path follower for every character of the current roster. */
  private resetAgents(): void {
    const agentIndices = this.characterManager.getAgentIndices()
    this.stateMachine = new CharacterStateMachine(agentIndices)
    this.pathAgents = new Map(
      agentIndices.map((agentIndex) => [
        agentIndex,
        new PathAgent(agentIndex, this.characterManager),
      ]),
    )
    this.arrivalCallbacks = new Map()
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
    const pathAgent = this.pathAgents.get(index)
    if (!pathAgent) return false

    let from: THREE.Vector3

    if (fromPosition) {
      from = fromPosition.clone()
    } else {
      from = new THREE.Vector3()
      if (!this.characterManager.getCPUPosition(index, from)) return false
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

    pathAgent.setPath(path, from)
    this.arrivalCallbacks.set(index, (arrivedIndex) => {
      if (targetOrientation) {
        this.characterManager.setOrientation(arrivedIndex, targetOrientation)
      }
      this.play(arrivedIndex, arrivalState)
      onArrival?.(arrivedIndex)
    })

    this.setPhysicsMode(index, AgentBehavior.GOTO)
    this.play(index, "walk")

    return true
  }

  /**
   * Walk a character to a POI by ID.
   * Occupies the POI immediately; releases existing ones first, but only once a path exists.
   *
   * A sit target is armed before walking, so when the sit_down timer expires the state machine
   * reads it directly. On arrival the character snaps to the exact POI position (removing any
   * navmesh offset) and, except for areas, its facing; seated arrivals switch to SEATED so a
   * stray GOTO can't move them.
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

        if (poi.kind !== "area") {
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

  /** Once per frame: expressions and the movement step, then state machine timers. */
  public update(deltaSeconds: number): void {
    this.characterManager.update(deltaSeconds)
    this.stateMachine.update(deltaSeconds, this)
  }

  /** Fades characters that overlap so neither hides the other; call after this frame's moves. */
  public updateOverlapFading(deltaSeconds: number): void {
    this.characterManager.updateOverlapFading(deltaSeconds)
  }

  /**
   * Advance path agents. Call after `update` so positions include this frame's step.
   * Fires arrival callbacks for agents that reach their destination, after keeping their last
   * movement direction as the IDLE facing.
   */
  public updatePaths(): void {
    const position = this.scratchPosition
    for (const [agentIndex, pathAgent] of this.pathAgents) {
      if (!pathAgent.isMoving) continue
      if (!this.characterManager.getCPUPosition(agentIndex, position)) continue

      const arrived = pathAgent.update(position.x, position.z)
      if (arrived) {
        const lastDirection = pathAgent.getLastDirection()
        this.characterManager.setFacing(agentIndex, lastDirection.x, lastDirection.z)

        this.setPhysicsMode(agentIndex, AgentBehavior.IDLE)
        this.arrivalCallbacks.get(agentIndex)?.(agentIndex)
      }
    }
  }

  /** Cancel movement for an agent and return to idle. */
  public cancelMovement(index: number): void {
    this.pathAgents.get(index)?.cancel()
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

    const spawnPois = this.poiManager.getPoisOfKind("spawn")
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

  /** Writes a character's world position into `out`. Returns false if the agent has no character. */
  public getCPUPosition(index: number, out: THREE.Vector3): boolean {
    return this.characterManager.getCPUPosition(index, out)
  }

  /** Agent indices of every character in the scene: the user and the team's agents. */
  public getAgentIndices(): readonly number[] {
    return this.characterManager.getAgentIndices()
  }

  /** Turns an idle character to face along (x, z). */
  public setFacing(index: number, x: number, z: number): void {
    this.characterManager.setFacing(index, x, z)
  }

  /**
   * Switches to another team's characters (one rebuild at most) and resets every character's state.
   * The outgoing roster's POIs are released first, so a removed agent does not keep its seat.
   */
  public setTeam(team: AgenticSystem): void {
    for (const agentIndex of this.characterManager.getAgentIndices()) {
      this.poiManager.releaseAll(agentIndex)
    }
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

  public getAnimationDuration(index: number, name: AnimationName): number {
    return this.characterManager.getAnimationDuration(index, name)
  }
}
