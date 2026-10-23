import { AgentBehavior } from "../../types"

/** Values per character in the position and velocity arrays: x, y, z and an unused w. */
export const MOVEMENT_STRIDE = 4

/** Walk step per frame at REFERENCE_FPS, before GOTO_SPEED_MULTIPLIER. */
const BASE_WALK_SPEED = 0.015
const REFERENCE_FPS = 60
/**
 * Lower bound on the frame-time speed scale. Keeps the per-frame velocity above the vertex
 * shader's moving threshold, so walkers keep facing their path on 240 Hz+ displays.
 */
const MIN_SPEED_SCALE = 0.25
const GOTO_SPEED_MULTIPLIER = 3.0
/** Within this distance of the waypoint a walker snaps onto it; the path follower then switches it to IDLE. */
const WAYPOINT_ARRIVAL_RADIUS = 0.2

/** The per-character behaviour mode and waypoint the movement step reads. */
export interface MovementTargets {
  getState(index: number): number
  getWaypointX(index: number): number
  getWaypointZ(index: number): number
}

/** How far a walker moves this frame: a fixed step at 60 fps, scaled by frame time. */
export function walkStepLength(deltaSeconds: number): number {
  return (
    BASE_WALK_SPEED *
    Math.max(deltaSeconds * REFERENCE_FPS, MIN_SPEED_SCALE) *
    GOTO_SPEED_MULTIPLIER
  )
}

/**
 * Advances every character one frame. A GOTO walker steps toward its waypoint (on the ground
 * plane, y = 0) and records the step as its velocity, which the vertex shader faces along; inside
 * the arrival radius it snaps onto the waypoint and keeps its last velocity until the path follower
 * switches it to IDLE. IDLE and SEATED characters stay put with zero velocity, so the vertex shader
 * turns them by their facing override instead of a stale walk direction.
 */
export function stepCharacterMovement(
  positions: Float32Array,
  velocities: Float32Array,
  targets: MovementTargets,
  count: number,
  deltaSeconds: number,
): void {
  const stepLength = walkStepLength(deltaSeconds)
  for (let index = 0; index < count; index++) {
    const offset = index * MOVEMENT_STRIDE
    positions[offset + 3] = 1
    if (targets.getState(index) !== AgentBehavior.GOTO) {
      velocities.fill(0, offset, offset + MOVEMENT_STRIDE)
      continue
    }
    const waypointX = targets.getWaypointX(index)
    const waypointZ = targets.getWaypointZ(index)
    const towardX = waypointX - positions[offset]
    const towardY = -positions[offset + 1]
    const towardZ = waypointZ - positions[offset + 2]
    const distance = Math.hypot(towardX, towardY, towardZ)
    if (distance > WAYPOINT_ARRIVAL_RADIUS) {
      const scale = stepLength / distance
      velocities[offset] = towardX * scale
      velocities[offset + 1] = towardY * scale
      velocities[offset + 2] = towardZ * scale
      velocities[offset + 3] = 0
      positions[offset] += velocities[offset]
      positions[offset + 1] += velocities[offset + 1]
      positions[offset + 2] += velocities[offset + 2]
    } else {
      positions[offset] = waypointX
      positions[offset + 2] = waypointZ
    }
  }
}
