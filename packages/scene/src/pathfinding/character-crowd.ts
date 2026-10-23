import { Crowd, type CrowdAgent, type NavMesh } from "@recast-navigation/core"
import {
  holdCharacterStill,
  isWithinArrivalRadius,
  MOVEMENT_STRIDE,
  type MovementBuffers,
  WALK_SPEED,
  writeWalkerMotion,
} from "../behavior/character-movement"

/** Half the 0.6 distance under which two characters visibly overlap. */
export const CHARACTER_RADIUS = 0.3
const CHARACTER_HEIGHT = 1.8
/** Reaches walking speed in under a tenth of a second, close to the old instant start. */
const MAX_ACCELERATION = 30
/** Detour's ANTICIPATE_TURNS | OPTIMIZE_VIS | OPTIMIZE_TOPO: follow the path, smoothly. */
const PATH_FOLLOWING_FLAGS = 1 | 8 | 16
/**
 * Detour's OBSTACLE_AVOIDANCE: steer around other characters. Its SEPARATION steering is left off:
 * it slowed walkers passing anyone within a few metres without keeping them further apart.
 */
const AVOIDANCE_FLAGS = 2
/** Detour's suggested ranges: neighbours within 12 radii, path shortcuts within 30 radii. */
const COLLISION_QUERY_RANGE = CHARACTER_RADIUS * 12
const PATH_OPTIMIZATION_RANGE = CHARACTER_RADIUS * 30
/** A neighbour range that finds no one, so a passing walker is not pushed back by anybody. */
const PASSING_QUERY_RANGE = 0.001
/**
 * Within this distance of its destination a walker stops avoiding and only follows its path.
 * Avoidance would stop it short: Detour keeps avoiding agents a radius away from the navmesh edge,
 * where chairs and spawns sit.
 */
const FINAL_APPROACH_DISTANCE = CHARACTER_RADIUS * 4
/**
 * Detour slows a walker down over its last two radii. Once nothing but a straight line is left
 * within that distance, the walker heads straight for its destination at full speed instead, so it
 * walks and arrives the way characters always have.
 */
const STRAIGHT_FINISH_DISTANCE = CHARACTER_RADIUS * 2
/** A walker that moves less than STALL_DISTANCE in STALL_SECONDS is stuck. */
const STALL_SECONDS = 0.6
const STALL_DISTANCE = 0.1
/** A character that is not walking but whose crowd agent is further than this from it is put back. */
const STATIONARY_DRIFT = 0.05

/**
 * How a walker gets past the others. It starts by avoiding them. Near its destination, or when
 * avoidance deadlocks (several characters crossing at once), it only follows its path, still
 * colliding with the others. If it is stuck again, someone blocks a passage or stands on its
 * destination, and it passes through them the way every character used to.
 */
type WalkPhase = "avoiding" | "following" | "passing"

interface Walk {
  destinationX: number
  destinationZ: number
  phase: WalkPhase
  finishingStraight: boolean
  stallX: number
  stallZ: number
  stallSeconds: number
}

/** A point in world space, as Detour takes it. */
interface CrowdPoint {
  x: number
  y: number
  z: number
}

/**
 * Moves walking characters through a Detour crowd, so they steer around each other. Every character
 * has a crowd agent, keyed by agent index. A walker's agent drives its position; a character that
 * is not walking (idle, seated, talking) keeps its own position, and its agent is pinned there as
 * an obstacle the walkers avoid, so a walker's push never moves it. Positions and velocities are
 * read and written through the slot mapping CharacterManager hands to `step`.
 */
export class CharacterCrowd {
  private readonly crowd: Crowd
  private readonly agents = new Map<number, CrowdAgent>()
  private readonly walks = new Map<number, Walk>()

  /** One crowd agent per character, each starting at the given position. */
  constructor(navMesh: NavMesh, startPositions: ReadonlyMap<number, CrowdPoint>) {
    this.crowd = new Crowd(navMesh, {
      maxAgents: Math.max(startPositions.size, 1),
      maxAgentRadius: CHARACTER_RADIUS,
    })
    for (const [agentIndex, start] of startPositions) {
      this.agents.set(
        agentIndex,
        this.crowd.addAgent(start, {
          radius: CHARACTER_RADIUS,
          height: CHARACTER_HEIGHT,
          maxSpeed: WALK_SPEED,
          maxAcceleration: MAX_ACCELERATION,
          updateFlags: PATH_FOLLOWING_FLAGS | AVOIDANCE_FLAGS,
          collisionQueryRange: COLLISION_QUERY_RANGE,
          pathOptimizationRange: PATH_OPTIMIZATION_RANGE,
        }),
      )
    }
  }

  /**
   * Starts walking the character from `from` (where it stands now) to the destination. A
   * character that was standing still is first put back exactly there. Returns false for an agent
   * the crowd does not have, or if the crowd could not take the request (no navmesh under the
   * destination).
   */
  public walk(
    agentIndex: number,
    from: CrowdPoint,
    destinationX: number,
    destinationZ: number,
  ): boolean {
    const agent = this.agents.get(agentIndex)
    if (!agent) return false
    if (!this.walks.has(agentIndex)) agent.teleport(from)
    if (!agent.requestMoveTarget({ x: destinationX, y: 0, z: destinationZ })) return false
    const walk: Walk = {
      destinationX,
      destinationZ,
      phase: "avoiding",
      finishingStraight: false,
      stallX: from.x,
      stallZ: from.z,
      stallSeconds: 0,
    }
    this.walks.set(agentIndex, walk)
    this.enterPhase(agent, walk, "avoiding")
    return true
  }

  /** Stops the character where it is. */
  public stop(agentIndex: number): void {
    const agent = this.agents.get(agentIndex)
    const walk = this.walks.get(agentIndex)
    if (!agent || !walk) return
    this.walks.delete(agentIndex)
    agent.resetMoveTarget()
    this.enterPhase(agent, walk, "avoiding")
  }

  public isWalking(agentIndex: number): boolean {
    return this.walks.has(agentIndex)
  }

  /**
   * Advances the crowd one frame and writes every character's position and velocity. A walker that
   * reaches its destination snaps onto it and stops.
   * @returns the agent indices of the characters that arrived this frame.
   */
  public step(buffers: MovementBuffers, deltaSeconds: number): number[] {
    const { positions, velocities } = buffers
    for (const [agentIndex, agent] of this.agents) {
      const slot = buffers.slotOf(agentIndex)
      if (slot !== null && !this.walks.has(agentIndex)) this.pinToCharacter(agent, positions, slot)
    }
    if (deltaSeconds > 0) this.crowd.update(deltaSeconds)

    const arrived: number[] = []
    for (const [agentIndex, agent] of this.agents) {
      const slot = buffers.slotOf(agentIndex)
      if (slot === null) continue
      const walk = this.walks.get(agentIndex)
      if (!walk) {
        holdCharacterStill(positions, velocities, slot)
        continue
      }
      const position = agent.position()
      const velocity = agent.velocity()
      writeWalkerMotion(
        positions,
        velocities,
        slot,
        { x: position.x, z: position.z, velocityX: velocity.x, velocityZ: velocity.z },
        deltaSeconds,
      )
      if (isWithinArrivalRadius(positions, slot, walk.destinationX, walk.destinationZ)) {
        const offset = slot * MOVEMENT_STRIDE
        positions[offset] = walk.destinationX
        positions[offset + 2] = walk.destinationZ
        this.stop(agentIndex)
        arrived.push(agentIndex)
        continue
      }
      this.advancePhase(agent, walk, position.x, position.z, deltaSeconds)
    }
    return arrived
  }

  /** Frees the crowd in the WebAssembly heap. */
  public dispose(): void {
    this.crowd.destroy()
  }

  private advancePhase(
    agent: CrowdAgent,
    walk: Walk,
    x: number,
    z: number,
    deltaSeconds: number,
  ): void {
    const stalled = this.isStalled(walk, x, z, deltaSeconds)
    const remaining = Math.hypot(walk.destinationX - x, walk.destinationZ - z)
    if (walk.phase === "avoiding" && (stalled || remaining < FINAL_APPROACH_DISTANCE)) {
      this.enterPhase(agent, walk, "following")
    } else if (walk.phase === "following" && stalled) {
      this.enterPhase(agent, walk, "passing")
    }
    if (
      remaining < STRAIGHT_FINISH_DISTANCE &&
      (walk.finishingStraight || agent.corners().length <= 1)
    ) {
      walk.finishingStraight = true
      const speedScale = WALK_SPEED / remaining
      agent.requestMoveVelocity({
        x: (walk.destinationX - x) * speedScale,
        y: 0,
        z: (walk.destinationZ - z) * speedScale,
      })
    }
  }

  private enterPhase(agent: CrowdAgent, walk: Walk, phase: WalkPhase): void {
    walk.phase = phase
    agent.updateFlags =
      phase === "avoiding" ? PATH_FOLLOWING_FLAGS | AVOIDANCE_FLAGS : PATH_FOLLOWING_FLAGS
    agent.collisionQueryRange = phase === "passing" ? PASSING_QUERY_RANGE : COLLISION_QUERY_RANGE
  }

  private isStalled(walk: Walk, x: number, z: number, deltaSeconds: number): boolean {
    if (Math.hypot(x - walk.stallX, z - walk.stallZ) > STALL_DISTANCE) {
      walk.stallX = x
      walk.stallZ = z
      walk.stallSeconds = 0
      return false
    }
    walk.stallSeconds += deltaSeconds
    if (walk.stallSeconds <= STALL_SECONDS) return false
    walk.stallSeconds = 0
    return true
  }

  private pinToCharacter(agent: CrowdAgent, positions: Float32Array, slot: number): void {
    const agentPosition = agent.position()
    const offset = slot * MOVEMENT_STRIDE
    const drift = Math.hypot(
      agentPosition.x - positions[offset],
      agentPosition.z - positions[offset + 2],
    )
    if (drift > STATIONARY_DRIFT) {
      agent.teleport({ x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] })
    }
  }
}
