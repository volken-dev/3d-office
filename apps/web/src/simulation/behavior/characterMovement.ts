/** Values per character in the position and velocity arrays: x, y, z and an unused w. */
export const MOVEMENT_STRIDE = 4

/** Walking speed in units per second: the original 0.045 units per frame at 60 fps. */
export const WALK_SPEED = 2.7
/** Within this distance of its destination a walker snaps onto it and arrives. */
export const ARRIVAL_RADIUS = 0.2

/**
 * The movement buffers, addressed by instance slot, and the slot of each agent. CharacterManager
 * hands them to the movement step; nothing keeps them past that call.
 */
export interface MovementBuffers {
  positions: Float32Array
  velocities: Float32Array
  /** The slot an agent's character occupies, or null when the agent has no character. */
  slotOf(agentIndex: number): number | null
}

/** A walker's ground-plane position and velocity (units per second) as the crowd reports them. */
export interface WalkerMotion {
  x: number
  z: number
  velocityX: number
  velocityZ: number
}

/**
 * Writes a walker's crowd-simulated motion into the movement buffers. Walkers stay on the ground
 * plane (y = 0). The velocity buffer holds this frame's step, which the vertex shader faces along
 * while it is long enough.
 */
export function writeWalkerMotion(
  positions: Float32Array,
  velocities: Float32Array,
  slot: number,
  motion: WalkerMotion,
  deltaSeconds: number,
): void {
  const offset = slot * MOVEMENT_STRIDE
  positions[offset] = motion.x
  positions[offset + 1] = 0
  positions[offset + 2] = motion.z
  positions[offset + 3] = 1
  velocities[offset] = motion.velocityX * deltaSeconds
  velocities[offset + 1] = 0
  velocities[offset + 2] = motion.velocityZ * deltaSeconds
  velocities[offset + 3] = 0
}

/**
 * Keeps a character that is not walking where it is, with zero velocity, so the vertex shader turns
 * it by its facing override instead of a stale walk direction.
 */
export function holdCharacterStill(
  positions: Float32Array,
  velocities: Float32Array,
  slot: number,
): void {
  const offset = slot * MOVEMENT_STRIDE
  positions[offset + 3] = 1
  velocities.fill(0, offset, offset + MOVEMENT_STRIDE)
}

/** Whether the character is within ARRIVAL_RADIUS of the destination on the ground plane. */
export function isWithinArrivalRadius(
  positions: Float32Array,
  slot: number,
  destinationX: number,
  destinationZ: number,
): boolean {
  const offset = slot * MOVEMENT_STRIDE
  return (
    Math.hypot(destinationX - positions[offset], destinationZ - positions[offset + 2]) <
    ARRIVAL_RADIUS
  )
}
