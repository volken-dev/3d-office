import type { FloorPoint } from "./floor-point"
import type { OfficeWorld } from "./office-world"
import { findPath } from "./path-finding"
import { resolveSlot } from "./poi-slots"

/** Metres per second: the Walk clip's stride (about 0.29 m per 0.33 s cycle). */
export const WALK_SPEED = 0.8

/** Radians per second a walking robot turns toward its next waypoint. */
export const TURN_RATE = 9

/** Seconds a robot takes to face its POI, crossfading Walk to Idle. */
export const TURN_TIME = 0.22

/** Seconds of crossfade between clips. */
export const CROSSFADE_TIME = 0.2

/** Seconds between looks for a free POI when none is free for the agent's state. */
export const RETRY_INTERVAL = 0.5

/** Seconds assumed for a one-shot clip the actor reports no length for. */
export const FALLBACK_CLIP_DURATION = 0.5

/** How a clip is started: `once` holds the last frame instead of looping; `fade` is the crossfade in seconds. */
export interface PlayOptions {
  once?: boolean
  fade?: number
}

/**
 * The engine side of an agent: whatever renders the robot. The simulation only ever poses it on
 * the floor and plays clips by name, so the same agent code runs under three.js, a fake in tests,
 * or headless on a server.
 */
export interface Actor {
  setPose(x: number, z: number, yaw: number): void
  play(clip: string, options: PlayOptions): void
  /** The clip's length in seconds; 0 when unknown. */
  duration(clip: string): number
}

type PlannedStep =
  | { readonly kind: "left" }
  | { readonly kind: "walk"; readonly to: FloorPoint }
  | { readonly kind: "turn"; readonly yaw: number }
  | { readonly kind: "enter"; readonly clip: string; readonly move: FloorPoint | null }
  | { readonly kind: "exit"; readonly clip: string; readonly move: FloorPoint | null }
  | { readonly kind: "loop"; readonly clip: string; readonly fade?: number }

/** The step an agent is on: walk, turn, enter or exit a POI, loop its state clip, or release a seat (`left`). */
export type AgentStepKind = PlannedStep["kind"]

interface ActiveStep {
  readonly plan: PlannedStep
  readonly startX: number
  readonly startZ: number
  readonly startYaw: number
  elapsed: number
  path: FloorPoint[]
  segment: number
  duration: number
}

/** Identifies an agent to its host; the simulation never reads it. */
export type AgentId = string | number

const SAME_POINT_DISTANCE = 1e-4

function smoothStep(fraction: number): number {
  return fraction * fraction * (3 - 2 * fraction)
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * One robot moving through the office, ported from agent-office's reference `Agent`. A state change
 * picks the state's first free POI (reserved at once, so two agents never pick the same one), then
 * runs steps in order: stand up out of the current seat (exit clips), walk the grid to the POI's
 * approach point, turn to the POI's yaw, enter (sit, plug in) and loop the state clip. Walking,
 * turning and looping give way to a newer state at once; entering and exiting always finish, so a
 * robot never teleports out of a chair. The seat being left stays reserved until the robot has
 * stood up. With no free POI the agent stays put and looks again every `RETRY_INTERVAL` seconds.
 */
export class OfficeAgent {
  readonly id: AgentId
  private readonly actor: Actor
  private readonly world: OfficeWorld
  private currentDesk: number
  private currentX = 0
  private currentZ = 0
  private currentYaw = 0
  private currentState: string | null = null
  private currentPoi: string | null = null
  private currentClip: string | null = null
  private currentPath: FloorPoint[] | null = null
  private leavingPoi: string | null = null
  private pending: string | null = null
  private retryIn: number | null = null
  private atPoi = false
  private steps: PlannedStep[] = []
  private activeStep: ActiveStep | null = null

  /**
   * @param desk the agent's slot (pod N, bay N) or, while queued, its queue position: what `own`
   *   and `position` slots resolve against.
   */
  constructor({
    id,
    desk,
    actor,
    world,
  }: {
    id: AgentId
    desk: number
    actor: Actor
    world: OfficeWorld
  }) {
    this.id = id
    this.currentDesk = desk
    this.actor = actor
    this.world = world
  }

  /** The agent's slot or queue position. */
  get desk(): number {
    return this.currentDesk
  }

  /** The state the agent is in or heading for, null before it has one. */
  get state(): string | null {
    return this.currentState
  }

  /** The POI the agent holds (where it is or is heading), null when it holds none. */
  get poi(): string | null {
    return this.currentPoi
  }

  /** The clip last started on the actor. */
  get clip(): string | null {
    return this.currentClip
  }

  /** The route of the current walk, null once the agent has turned to face its POI. */
  get path(): readonly FloorPoint[] | null {
    return this.currentPath
  }

  /** The step the agent is on, null when it has none. */
  get stepKind(): AgentStepKind | null {
    return this.activeStep?.plan.kind ?? null
  }

  /** Whether the agent is moving or in a transition rather than looping a clip. */
  get busy(): boolean {
    return this.activeStep !== null && this.activeStep.plan.kind !== "loop"
  }

  /** Whether the agent has arrived: looping its clip with nothing pending and no retry waiting. */
  get settled(): boolean {
    return this.activeStep?.plan.kind === "loop" && this.pending === null && this.retryIn === null
  }

  /** Floor x, in metres. */
  get x(): number {
    return this.currentX
  }

  /** Floor z, in metres. */
  get z(): number {
    return this.currentZ
  }

  /** Facing, in radians (0 faces +z). */
  get yaw(): number {
    return this.currentYaw
  }

  /**
   * Puts the agent straight into a state at its POI with no walking, for the first frame or a fresh
   * session. Returns false, changing nothing, when no POI is free for the state.
   */
  place(state: string): boolean {
    const slot = resolveSlot(
      this.world.agentStates,
      state,
      this.currentDesk,
      this.world.taken,
      this.world.poiNames,
    )
    if (!slot) return false
    const poi = this.world.poiNamed(slot.poi)
    this.hold(slot.poi)
    this.currentState = state
    this.retryIn = null
    this.currentX = poi.x
    this.currentZ = poi.z
    this.currentYaw = poi.yaw
    this.steps = []
    this.begin({ kind: "loop", clip: slot.clip, fade: 0 })
    return true
  }

  /** Puts the agent at a spot (a spawn point) with no state and no POI, idling. */
  spawnAt(x: number, z: number, yaw = 0): void {
    this.release()
    this.currentX = x
    this.currentZ = z
    this.currentYaw = yaw
    this.currentState = null
    this.retryIn = null
    this.steps = []
    this.begin({ kind: "loop", clip: "Idle", fade: 0 })
  }

  /** Gives the agent a new slot or queue position and re-targets its state's POI (the queue moving up). */
  setDesk(desk: number): void {
    if (desk === this.currentDesk) return
    this.currentDesk = desk
    if (this.currentState === null && this.pending === null) return
    this.pending = this.pending ?? this.currentState
    if (this.isInterruptible()) this.replan()
  }

  /** Sends the agent to a new state; applied now unless it is entering or leaving a POI. */
  setState(state: string): void {
    if (state === this.currentState && this.pending === null) return
    this.pending = state
    if (this.isInterruptible()) this.replan()
  }

  /** Frees every POI the agent holds, for when its session ends and the robot goes away. */
  release(): void {
    if (this.currentPoi !== null) this.world.taken.delete(this.currentPoi)
    this.currentPoi = null
    this.leave()
  }

  /** Advances the agent by a frame and poses its actor. */
  update(deltaSeconds: number): void {
    if (this.retryIn !== null) {
      this.retryIn -= deltaSeconds
      const isLooping = this.activeStep === null || this.activeStep.plan.kind === "loop"
      if (this.retryIn <= 0 && isLooping) {
        this.retryIn = null
        this.pending = this.pending ?? this.currentState
        this.replan()
      }
    }
    const step = this.activeStep
    if (step) {
      step.elapsed += deltaSeconds
      const plan = step.plan
      if (plan.kind === "walk") {
        this.walk(step, deltaSeconds)
      } else if (plan.kind === "turn") {
        const fraction = Math.min(1, step.elapsed / TURN_TIME)
        this.currentYaw = step.startYaw + wrapAngle(plan.yaw - step.startYaw) * smoothStep(fraction)
        if (fraction >= 1) this.next()
      } else if (plan.kind === "enter" || plan.kind === "exit") {
        if (plan.move) {
          const fraction = smoothStep(Math.min(1, step.elapsed / step.duration))
          this.currentX = step.startX + (plan.move[0] - step.startX) * fraction
          this.currentZ = step.startZ + (plan.move[1] - step.startZ) * fraction
        }
        if (step.elapsed >= step.duration) {
          const stoodUpWithNewerState = plan.kind === "exit" && plan.move && this.pending !== null
          if (stoodUpWithNewerState) this.replan()
          else this.next()
        }
      }
    }
    this.actor.setPose(this.currentX, this.currentZ, this.currentYaw)
  }

  private isInterruptible(): boolean {
    const kind = this.activeStep?.plan.kind
    return kind === undefined || kind === "walk" || kind === "turn" || kind === "loop"
  }

  private hold(poi: string): void {
    this.release()
    this.currentPoi = poi
    this.world.taken.add(poi)
  }

  private leave(): void {
    if (this.leavingPoi !== null && this.leavingPoi !== this.currentPoi) {
      this.world.taken.delete(this.leavingPoi)
    }
    this.leavingPoi = null
  }

  private replan(): void {
    const state = this.pending
    this.pending = null
    if (state === null) return
    const world = this.world
    const wasAtPoi = this.activeStep?.plan.kind === "loop" && this.atPoi
    this.leave()
    const previousPoi = this.currentPoi
    const takenByOthers = new Set(world.taken)
    if (previousPoi !== null) takenByOthers.delete(previousPoi)
    const slot = resolveSlot(
      world.agentStates,
      state,
      this.currentDesk,
      takenByOthers,
      world.poiNames,
    )
    this.currentState = state
    if (!slot) {
      this.retryIn = RETRY_INTERVAL
      return
    }
    this.retryIn = null
    if (slot.poi === previousPoi && wasAtPoi) {
      this.steps = []
      this.begin({ kind: "loop", clip: slot.clip })
      return
    }
    const exitClips =
      wasAtPoi && previousPoi !== null ? (world.transitionFor(previousPoi).exit ?? []) : []
    const steps: PlannedStep[] = []
    if (previousPoi !== null && previousPoi !== slot.poi) {
      if (exitClips.length > 0) this.leavingPoi = previousPoi
      else world.taken.delete(previousPoi)
    }
    this.currentPoi = slot.poi
    world.taken.add(slot.poi)
    if (previousPoi !== null) {
      exitClips.forEach((clip, clipIndex) => {
        const isLast = clipIndex === exitClips.length - 1
        steps.push({ kind: "exit", clip, move: isLast ? world.approachOf(previousPoi) : null })
      })
    }
    steps.push({ kind: "left" })
    const target = world.poiNamed(slot.poi)
    steps.push({ kind: "walk", to: world.approachOf(slot.poi) })
    steps.push({ kind: "turn", yaw: target.yaw })
    const enterClips = world.transitionFor(slot.poi).enter ?? []
    enterClips.forEach((clip, clipIndex) => {
      steps.push({ kind: "enter", clip, move: clipIndex === 0 ? [target.x, target.z] : null })
    })
    steps.push({ kind: "loop", clip: slot.clip })
    this.steps = steps
    this.next()
  }

  private next(): void {
    const plan = this.steps.shift()
    if (plan) this.begin(plan)
    else this.activeStep = null
  }

  private begin(plan: PlannedStep): void {
    const step: ActiveStep = {
      plan,
      startX: this.currentX,
      startZ: this.currentZ,
      startYaw: this.currentYaw,
      elapsed: 0,
      path: [],
      segment: 1,
      duration: 0,
    }
    this.activeStep = step
    const fade = plan.kind === "loop" && plan.fade !== undefined ? plan.fade : CROSSFADE_TIME
    this.atPoi = false
    switch (plan.kind) {
      case "left":
        this.leave()
        this.next()
        return
      case "walk":
        step.path = findPath(this.world.grid, [this.currentX, this.currentZ], plan.to) ?? [
          [this.currentX, this.currentZ],
          plan.to,
        ]
        this.currentPath = step.path
        this.play("Walk", { fade })
        return
      case "turn":
        this.currentPath = null
        this.play("Idle", { fade: TURN_TIME })
        return
      case "enter":
      case "exit": {
        this.play(plan.clip, { once: true, fade })
        const clipDuration = this.actor.duration(plan.clip)
        step.duration = clipDuration > 0 ? clipDuration : FALLBACK_CLIP_DURATION
        return
      }
      case "loop":
        this.atPoi = this.currentPoi !== null
        this.play(plan.clip, { fade })
        if (this.pending !== null) this.replan()
        return
    }
  }

  private play(clip: string, options: PlayOptions): void {
    if (clip !== this.currentClip || options.once) {
      this.currentClip = clip
      this.actor.play(clip, options)
    }
  }

  private walk(step: ActiveStep, deltaSeconds: number): void {
    let remaining = WALK_SPEED * deltaSeconds
    while (remaining > 0 && step.segment < step.path.length) {
      const waypoint = step.path[step.segment]
      if (!waypoint) break
      const [waypointX, waypointZ] = waypoint
      const towardX = waypointX - this.currentX
      const towardZ = waypointZ - this.currentZ
      const distance = Math.hypot(towardX, towardZ)
      if (distance > SAME_POINT_DISTANCE) {
        const heading = Math.atan2(towardX, towardZ)
        this.currentYaw +=
          wrapAngle(heading - this.currentYaw) * Math.min(1, TURN_RATE * deltaSeconds)
      }
      if (distance <= remaining) {
        this.currentX = waypointX
        this.currentZ = waypointZ
        remaining -= distance
        step.segment++
      } else {
        this.currentX += (towardX / distance) * remaining
        this.currentZ += (towardZ / distance) * remaining
        remaining = 0
      }
    }
    if (step.segment >= step.path.length) {
      if (this.pending !== null) this.replan()
      else this.next()
    }
  }
}
