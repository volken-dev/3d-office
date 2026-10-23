import * as THREE from "three/webgpu"
import type { CharacterStateKey, IAgentDriver } from "../../types"
import type { CharacterController } from "../character-controller"
import { WANDER_SPREAD_DIRECTIONS } from "../constants"
import { spawnPoiId } from "../world/poi-ids"

/** Seconds before an NPC's first idle decision: INITIAL_WAIT_MIN plus up to INITIAL_WAIT_RANGE. */
const INITIAL_WAIT_MIN = 2
const INITIAL_WAIT_RANGE = 5
/** Distance from its spawn beyond which the lead walks back to celebrate; wider than the arrival radius so it doesn't oscillate at the edge. */
const CELEBRATION_RADIUS = 1.5
const STAY_SEATED_CHANCE = 0.1
const GO_SIT_CHANCE = 0.4
/** Rolls below this (and above GO_SIT_CHANCE when standing) wander to a common area. */
const WANDER_CHANCE = 0.7
/** Agents spread around an area's centre on a circle of this radius, one slot per possible agent. */
const AREA_SPREAD_RADIUS = 1
const UP_AXIS = new THREE.Vector3(0, 1, 0)

function randomSeconds(minimum: number, range: number): number {
  return Math.random() * range + minimum
}

/** Wanders, sits and idles an NPC while it has no task; stays put while SceneManager moves it for work. */
export class NpcAgentDriver implements IAgentDriver {
  private behaviorTimer: number = randomSeconds(INITIAL_WAIT_MIN, INITIAL_WAIT_RANGE)
  private isChattingWithMe = false
  /** Has a scheduled, in-progress or on-hold task. */
  private isBusy = false
  private projectDone = false
  /** This frame's position; moveTo copies it, so it is safe to reuse. */
  private readonly position = new THREE.Vector3()

  constructor(
    public readonly agentIndex: number,
    protected readonly controller: CharacterController,
    private readonly isLead: boolean,
  ) {}

  /** Suspends autonomy while the user chats with this agent. */
  public setChatting(isChatting: boolean): void {
    this.isChattingWithMe = isChatting
  }

  /** Leaving work picks a new idle activity right away instead of lingering at the desk. */
  public setBusy(busy: boolean): void {
    if (this.isBusy && !busy) this.behaviorTimer = 0
    this.isBusy = busy
  }

  public setProjectDone(done: boolean): void {
    this.projectDone = done
  }

  /**
   * The lead celebrates at its spot once the project is delivered. SceneManager drives movement to
   * desks and the boardroom while the agent has work. Otherwise new actions are only decided from
   * a resting state.
   */
  public update(deltaSeconds: number): void {
    if (this.isChattingWithMe) return
    const position = this.position
    if (!this.controller.getCPUPosition(this.agentIndex, position)) return

    const currentState = this.controller.getState(this.agentIndex)

    if (this.isLead && this.projectDone) {
      this._updateProjectReadyBehavior(position, currentState)
      return
    }

    if (this.isBusy) return

    if (currentState === "idle" || currentState === "sit_idle" || currentState === "look_around") {
      this.behaviorTimer -= deltaSeconds

      if (this.behaviorTimer <= 0) {
        this._decideNextAction(position, currentState)
      }
    }
  }

  /**
   * Walks the lead back to its spawn, then loops the happy state there. Once close, it snaps to the
   * spawn orientation; movement is only cancelled when not already arriving through moveTo's
   * arrival state (idle).
   */
  private _updateProjectReadyBehavior(
    currentPosition: THREE.Vector3,
    currentState: CharacterStateKey,
  ): void {
    const targetPoi = this.controller.poiManager.getPoi(spawnPoiId(this.agentIndex))
    if (!targetPoi) return

    if (
      currentPosition.distanceToSquared(targetPoi.position) >
      CELEBRATION_RADIUS * CELEBRATION_RADIUS
    ) {
      if (currentState !== "walk") {
        this.controller.moveTo(
          this.agentIndex,
          targetPoi.position,
          "happy_loop",
          undefined,
          currentPosition,
          targetPoi.quaternion,
        )
      }
      return
    }

    const isHappy = currentState === "happy_loop"
    if (!isHappy && currentState !== "walk") {
      this.controller.characterManager.setOrientation(this.agentIndex, targetPoi.quaternion)

      if (currentState !== "idle") {
        this.controller.cancelMovement(this.agentIndex)
      }
      this.controller.play(this.agentIndex, "happy_loop")
    }
  }

  /**
   * One idle decision from a single roll. Seated: mostly stand up and fall through to the standing
   * options (but never sit again straight away), sometimes stay seated. Standing: maybe go sit (the
   * lead never sits), else maybe wander to a common area facing its centre, else play a short
   * reaction. A seated agent that wanted to get up but found nowhere to go stays seated.
   */
  private _decideNextAction(currentPosition: THREE.Vector3, currentState: CharacterStateKey): void {
    const roll = Math.random()
    const isSeated = currentState === "sit_idle"

    if (isSeated && roll < STAY_SEATED_CHANCE) {
      this.controller.play(this.agentIndex, "sit_idle")
      this.behaviorTimer = randomSeconds(15, 15)
      return
    }

    if (!isSeated && roll < GO_SIT_CHANCE && !this.isLead) {
      const pois = this.controller.poiManager.getFreePoisOfKind("seat", this.agentIndex)
      if (pois.length > 0) {
        const poi = pois[Math.floor(Math.random() * pois.length)]
        this.controller.walkToPoi(this.agentIndex, poi.id, undefined, currentPosition)
        this.behaviorTimer = randomSeconds(15, 15)
        return
      }
    }

    if (roll < WANDER_CHANCE) {
      const areaPois = this.controller.poiManager.getFreePoisOfKind("area", this.agentIndex)
      if (areaPois.length > 0) {
        const areaPoi = areaPois[Math.floor(Math.random() * areaPois.length)]

        const angle = (this.agentIndex * (Math.PI * 2)) / WANDER_SPREAD_DIRECTIONS
        const target = areaPoi.position.clone()
        target.x += Math.cos(angle) * AREA_SPREAD_RADIUS
        target.z += Math.sin(angle) * AREA_SPREAD_RADIUS

        const direction = new THREE.Vector3().subVectors(areaPoi.position, target).normalize()
        const rotationY = Math.atan2(direction.x, direction.z)
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, rotationY)

        if (
          this.controller.moveTo(
            this.agentIndex,
            target,
            "look_around",
            undefined,
            currentPosition,
            targetQuaternion,
          )
        ) {
          this.controller.poiManager.releaseAll(this.agentIndex)
          this.behaviorTimer = randomSeconds(10, 5)
          return
        }
      }
    }

    if (!isSeated) {
      const reactions: CharacterStateKey[] = ["look_around", "wave", "happy"]
      const reaction = reactions[Math.floor(Math.random() * reactions.length)]
      this.controller.play(this.agentIndex, reaction)
      this.behaviorTimer = randomSeconds(5, 5)
    } else {
      this.behaviorTimer = 5
    }
  }

  public dispose(): void {}
}
