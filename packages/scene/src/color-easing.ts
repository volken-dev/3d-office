import type * as THREE from "three/webgpu"

/** How fast a status colour eases to a new one, per second, as in the agent-office viewer. */
export const STATUS_COLOR_EASE_RATE = 6

/** Summed channel difference below which an easing colour snaps onto its target. */
const SNAP_DISTANCE = 0.006

/**
 * Moves `current` a frame's worth toward `target`, snapping once it is close so the ease ends
 * exactly on the target. Returns whether `current` changed, so callers only rewrite what moved.
 */
export function easeColorToward(
  current: THREE.Color,
  target: THREE.Color,
  deltaSeconds: number,
): boolean {
  if (current.equals(target)) return false
  current.lerp(target, Math.min(1, deltaSeconds * STATUS_COLOR_EASE_RATE))
  const distance =
    Math.abs(current.r - target.r) + Math.abs(current.g - target.g) + Math.abs(current.b - target.b)
  if (distance < SNAP_DISTANCE) current.copy(target)
  return true
}
