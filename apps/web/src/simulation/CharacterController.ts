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
import { MOVEMENT_STRIDE, type MovementBuffers } from "./behavior/characterMovement"
import type { CharacterManager } from "./entities/CharacterManager"
import { CharacterCrowd } from "./pathfinding/CharacterCrowd"
import type { NavMeshManager } from "./pathfinding/NavMeshManager"
import type { PoiManager } from "./world/PoiManager"

const ORIGIN = new THREE.Vector3(0, 0, 0)
/** Per-frame walk step below which a walker's facing is left as it was, rather than set to noise. */
const FACING_STEP_THRESHOLD = 0.0001

/** What happens when a walker arrives: it faces along its path's last leg, then the callback runs. */
interface Arrival {
  facingX: number
  facingZ: number
  onArrival: (index: number) => void
}

/**
 * CharacterController — unified API for controlling any character (player or NPC).
 *
 * Composes:
 *  - CharacterManager     → position buffers, GPU rendering, animation baking, expression buffers
 *  - CharacterStateMachine → declarative state→animation+expression mapping
 *  - CharacterCrowd       → walking, with characters steering around each other
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
  private crowd: CharacterCrowd | null = null
  /** Per walker, by agent index: what to do when it reaches its destination. */
  private arrivals = new Map<number, Arrival>()

  constructor(
    public readonly characterManager: CharacterManager,
    private readonly navMesh: NavMeshManager,
    public readonly poiManager: PoiManager,
    private playerIndex: number,
  ) {
    this.resetAgents()
  }

  /**
   * Fresh state machine and crowd for every character of the current roster, with the crowd's
   * agents where the characters stand. Without a navmesh there is no crowd, and nobody walks.
   */
  private resetAgents(): void {
    const agentIndices = this.characterManager.getAgentIndices()
    this.stateMachine = new CharacterStateMachine(agentIndices)
    this.crowd?.dispose()
    this.crowd = null
    this.arrivals = new Map()
    const navMesh = this.navMesh.getNavMesh()
    if (!navMesh) return
    const startPositions = new Map<number, THREE.Vector3>()
    for (const agentIndex of agentIndices) {
      const start = new THREE.Vector3()
      if (this.characterManager.getCPUPosition(agentIndex, start)) {
        startPositions.set(agentIndex, start)
      }
    }
    this.crowd = new CharacterCrowd(navMesh, startPositions)
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
   * The crowd walks it to the exact target, not the nearest navmesh point, steering around the
   * other characters on the way. On arrival it faces along the path's last leg. The player can end
   * up just off the navmesh, where no path exists; it is teleported rather than ignoring the click.
   *
   * @param arrivalState State to enter upon reaching the destination (default: 'idle')
   * @param onArrival    Optional callback fired when the destination is reached
   * @param fromPosition Optional start position for the path query (defaults to current CPU position)
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
    const current = new THREE.Vector3()
    if (!this.characterManager.getCPUPosition(index, current)) return false

    let from: THREE.Vector3

    if (fromPosition) {
      from = fromPosition.clone()
    } else {
      from = current.clone()
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

    if (!this.crowd?.walk(index, current, target.x, target.z)) return false

    const lastLegStart = path.length > 1 ? path[path.length - 2] : from
    const facing = new THREE.Vector3(target.x - lastLegStart.x, 0, target.z - lastLegStart.z)
    if (facing.lengthSq() === 0) facing.set(0, 0, 1)
    facing.normalize()
    this.arrivals.set(index, {
      facingX: facing.x,
      facingZ: facing.z,
      onArrival: (arrivedIndex) => {
        if (targetOrientation) {
          this.characterManager.setOrientation(arrivedIndex, targetOrientation)
        }
        this.play(arrivedIndex, arrivalState)
        onArrival?.(arrivedIndex)
      },
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

  /**
   * Once per frame: expressions, then the crowd moves the walkers, then state machine timers, then
   * arrivals. A walker faces the way it moves, so it keeps that facing whenever its step is too
   * short for the vertex shader to turn it by velocity. An arriving walker faces along its path's
   * last leg, switches to IDLE and runs its arrival callback.
   */
  public update(deltaSeconds: number): void {
    this.characterManager.update(deltaSeconds)
    const crowd = this.crowd
    let arrived: number[] = []
    if (crowd) {
      this.characterManager.applyMovement((buffers) => {
        arrived = crowd.step(buffers, deltaSeconds)
        this.faceWalkDirections(crowd, buffers)
      })
    }
    this.stateMachine.update(deltaSeconds, this)
    for (const agentIndex of arrived) {
      const arrival = this.arrivals.get(agentIndex)
      this.arrivals.delete(agentIndex)
      if (arrival) this.characterManager.setFacing(agentIndex, arrival.facingX, arrival.facingZ)
      this.setPhysicsMode(agentIndex, AgentBehavior.IDLE)
      arrival?.onArrival(agentIndex)
    }
  }

  private faceWalkDirections(crowd: CharacterCrowd, buffers: MovementBuffers): void {
    for (const agentIndex of this.characterManager.getAgentIndices()) {
      const slot = buffers.slotOf(agentIndex)
      if (slot === null || !crowd.isWalking(agentIndex)) continue
      const stepX = buffers.velocities[slot * MOVEMENT_STRIDE]
      const stepZ = buffers.velocities[slot * MOVEMENT_STRIDE + 2]
      if (Math.hypot(stepX, stepZ) > FACING_STEP_THRESHOLD) {
        this.characterManager.setFacing(agentIndex, stepX, stepZ)
      }
    }
  }

  /** Fades characters that overlap so neither hides the other; call after this frame's moves. */
  public updateOverlapFading(deltaSeconds: number): void {
    this.characterManager.updateOverlapFading(deltaSeconds)
  }

  /** Cancel movement for an agent and return to idle. */
  public cancelMovement(index: number): void {
    this.crowd?.stop(index)
    this.arrivals.delete(index)
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

  /** Frees the crowd. */
  public dispose(): void {
    this.crowd?.dispose()
    this.crowd = null
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
