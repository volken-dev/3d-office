import type { WalkGrid } from "./walk-grid"

/** Half the robot's widest extent (head and arms, 0.84 m), in metres. */
export const ROBOT_RADIUS = 0.42

/** Metres ahead a walking robot looks for others to steer around or follow. */
export const AVOIDANCE_LOOKAHEAD = 1.4

/** Centre-to-centre gap a robot keeps behind one walking the same way: the robot's depth plus room. */
export const FOLLOWING_GAP = 0.8

/** Metres per second a robot can step sideways while steering round another. */
export const SIDESTEP_SPEED = 0.6

/** Metres ahead a robot watches for one walking straight at it: far enough to make room in time. */
export const HEAD_ON_LOOKAHEAD = 2.5

/** Fraction of walking speed while passing a robot coming the other way. */
export const PASSING_SPEED_SCALE = 0.6

/**
 * Where a robot is on the floor and which way it is going, as every other robot sees it. Robots
 * publish one each frame in the world's `bodies`.
 */
export interface RobotBody {
  x: number
  z: number
  /** Unit heading on the floor; (0, 0) when not walking. */
  headingX: number
  headingZ: number
  isWalking: boolean
}

/** How a walking robot adjusts this frame: a fraction of its walking speed and a sideways velocity. */
export interface Steering {
  speedScale: number
  sideX: number
  sideZ: number
}

const NO_STEERING: Steering = { speedScale: 1, sideX: 0, sideZ: 0 }

/** Dot product below which two headings count as opposite (walking at each other). */
const HEAD_ON_ALIGNMENT = -0.3
/** Dot product above which two headings count as the same way (one following the other). */
const SAME_WAY_ALIGNMENT = 0.5
/** Metres beyond the following gap over which a robot giving way to a crosser slows to a stop. */
const GIVE_WAY_RANGE = 0.4

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Steering for one walking robot from the robots around it, the light local avoidance the
 * agent-office contract leaves to the product. Robots off the walk grid (seated inside furniture,
 * plugged into a bay) are ignored, so walkers never steer round seats. For each robot ahead and
 * close to the walker's line:
 * - walking the same way: slow down to keep `FOLLOWING_GAP` behind it;
 * - walking straight at it (watched from `HEAD_ON_LOOKAHEAD` until they are past each other):
 *   step to the right at full sidestep speed and slow to `PASSING_SPEED_SCALE`, slower still as
 *   they close, so the sidestep has time to work when one appears round a corner (both do, so
 *   they pass on their left sides, each hugging its own side of an aisle);
 * - crossing: give way to a robot coming from the right, carry on for one from the left;
 * - standing still: step round it, away from the side it is on.
 * Pure, so it runs the same in the browser, a worker or a test.
 */
export function steeringFor(
  self: RobotBody,
  others: Iterable<RobotBody>,
  grid: WalkGrid,
): Steering {
  const { headingX, headingZ } = self
  if (headingX === 0 && headingZ === 0) return NO_STEERING
  const rightX = -headingZ
  const rightZ = headingX
  let speedScale = 1
  let sideX = 0
  let sideZ = 0

  for (const other of others) {
    if (other === self || !grid.isWalkable(other.x, other.z)) continue
    const offsetX = other.x - self.x
    const offsetZ = other.z - self.z
    const ahead = offsetX * headingX + offsetZ * headingZ
    const toRight = offsetX * rightX + offsetZ * rightZ
    if (Math.abs(toRight) >= 2 * ROBOT_RADIUS) continue
    const alignment = other.isWalking
      ? other.headingX * headingX + other.headingZ * headingZ
      : Number.NaN
    const isHeadOn = other.isWalking && alignment < HEAD_ON_ALIGNMENT
    if (isHeadOn) {
      const isAlongsideOrAhead = ahead > -2 * ROBOT_RADIUS && ahead < HEAD_ON_LOOKAHEAD
      if (!isAlongsideOrAhead) continue
      sideX += rightX
      sideZ += rightZ
      if (ahead < AVOIDANCE_LOOKAHEAD) {
        const roomScale = clamp01(
          (ahead - 2 * ROBOT_RADIUS) / (AVOIDANCE_LOOKAHEAD - 2 * ROBOT_RADIUS),
        )
        speedScale = Math.min(speedScale, PASSING_SPEED_SCALE * Math.max(roomScale, 0.3))
      }
      continue
    }
    if (ahead <= 0 || ahead > AVOIDANCE_LOOKAHEAD) continue
    const closeness = 1 - ahead / AVOIDANCE_LOOKAHEAD

    if (other.isWalking && alignment > SAME_WAY_ALIGNMENT) {
      const followScale = clamp01((ahead - FOLLOWING_GAP) / (AVOIDANCE_LOOKAHEAD - FOLLOWING_GAP))
      speedScale = Math.min(speedScale, followScale)
    } else if (other.isWalking) {
      if (toRight > 0) {
        speedScale = Math.min(speedScale, clamp01((ahead - FOLLOWING_GAP) / GIVE_WAY_RANGE))
      }
    } else {
      const away = toRight > 0 ? -1 : 1
      sideX += rightX * away * closeness
      sideZ += rightZ * away * closeness
      if (ahead < FOLLOWING_GAP) speedScale = Math.min(speedScale, 0.35)
    }
  }

  const sideLength = Math.hypot(sideX, sideZ)
  if (sideLength > 1) {
    sideX /= sideLength
    sideZ /= sideLength
  }
  return { speedScale, sideX: sideX * SIDESTEP_SPEED, sideZ: sideZ * SIDESTEP_SPEED }
}
