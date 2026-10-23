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
import { MOVEMENT_STRIDE } from "./behavior/characterMovement"
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
 * All behavior code (PlayerInputDriver, NpcAgentDriver) goes through this class.
 */
export class CharacterController implements ICharacterDriver {
  private stateMachine!: CharacterStateMachine
  private crowd: CharacterCrowd | null = null
  /** Per walker: what to do when it reaches its destination. */
  private arrivals: (Arrival | null)[] = []

  constructor(
    public readonly characterManager: CharacterManager,
    private readonly navMesh: NavMeshManager,
    public readonly poiManager: PoiManager,
    private playerIndex: number,
  ) {
    this.resetAgents()
  }

  /**
   * Fresh state machine and crowd sized to the current character count, with the crowd's agents at
   * the characters' positions. Needs the characters to be loaded. Without a navmesh there is no
   * crowd, and nobody walks.
   */
  private resetAgents(): void {
    const count = this.characterManager.getCount()
    const positions = this.characterManager.getCPUPositions()
    if (!positions) throw new Error("CharacterController needs loaded characters")
    this.stateMachine = new CharacterStateMachine(count)
    this.crowd?.dispose()
    const navMesh = this.navMesh.getNavMesh()
    this.crowd = navMesh ? new CharacterCrowd(navMesh, positions, count) : null
    this.arrivals = new Array(count).fill(null)
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

    const positions = this.characterManager.getCPUPositions()
    if (!positions || !this.crowd?.walk(index, positions, target.x, target.z)) return false

    const lastLegStart = path.length > 1 ? path[path.length - 2] : from
    const facing = new THREE.Vector3(target.x - lastLegStart.x, 0, target.z - lastLegStart.z)
    if (facing.lengthSq() === 0) facing.set(0, 0, 1)
    facing.normalize()
    this.arrivals[index] = {
      facingX: facing.x,
      facingZ: facing.z,
      onArrival: (arrivedIndex) => {
        if (targetOrientation) {
          this.characterManager.setOrientation(arrivedIndex, targetOrientation)
        }
        this.play(arrivedIndex, arrivalState)
        onArrival?.(arrivedIndex)
      },
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
   * reads it directly. On arrival the character snaps to the exact POI position (removing any
   * navmesh offset) and, except for 'area' POIs, its facing; seated arrivals switch to SEATED so a
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
      this.characterManager.applyMovement((positions, velocities) => {
        arrived = crowd.step(positions, velocities, deltaSeconds)
        this.faceWalkDirections(crowd, velocities)
      })
    }
    this.stateMachine.update(deltaSeconds, this)
    for (const agentIndex of arrived) {
      const arrival = this.arrivals[agentIndex]
      this.arrivals[agentIndex] = null
      if (arrival) this.characterManager.setFacing(agentIndex, arrival.facingX, arrival.facingZ)
      this.setPhysicsMode(agentIndex, AgentBehavior.IDLE)
      arrival?.onArrival(agentIndex)
    }
  }

  private faceWalkDirections(crowd: CharacterCrowd, velocities: Float32Array): void {
    for (let agentIndex = 0; agentIndex < this.getCount(); agentIndex++) {
      if (!crowd.isWalking(agentIndex)) continue
      const stepX = velocities[agentIndex * MOVEMENT_STRIDE]
      const stepZ = velocities[agentIndex * MOVEMENT_STRIDE + 2]
      if (Math.hypot(stepX, stepZ) > FACING_STEP_THRESHOLD) {
        this.characterManager.setFacing(agentIndex, stepX, stepZ)
      }
    }
  }

  /** Cancel movement for an agent and return to idle. */
  public cancelMovement(index: number): void {
    this.crowd?.stop(index)
    this.arrivals[index] = null
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
