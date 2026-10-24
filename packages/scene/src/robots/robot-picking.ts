import * as THREE from "three/webgpu"

/** Pointer travel, in CSS pixels, beyond which a press is a drag (a pan or a turn), not a click. */
export const CLICK_TRAVEL_PIXELS = 5

/** The pick capsule around a standing robot: its radius, and its height from the floor. */
const PICK_RADIUS = 0.4
const PICK_HEIGHT = 1.4

/** A robot that can be picked: its slot and its floor position. */
export interface PickTarget {
  agentIndex: number
  position: THREE.Vector3
}

/** Whether a press released at `up` after going down at `down` is a click rather than a drag. */
export function isClick(
  down: { x: number; y: number },
  up: { x: number; y: number },
  travelPixels = CLICK_TRAVEL_PIXELS,
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= travelPixels
}

const capsuleBottom = new THREE.Vector3()
const capsuleTop = new THREE.Vector3()
const pointOnRay = new THREE.Vector3()

/**
 * The slot of the nearest robot whose capsule the ray passes through, or null. Picking tests a
 * capsule per robot (a vertical segment and a radius), so it never touches skinned vertices.
 */
export function pickRobot(ray: THREE.Ray, targets: Iterable<PickTarget>): number | null {
  let nearestIndex: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const target of targets) {
    capsuleBottom.copy(target.position).setY(target.position.y + PICK_RADIUS)
    capsuleTop.copy(target.position).setY(target.position.y + PICK_HEIGHT - PICK_RADIUS)
    const distanceSquared = ray.distanceSqToSegment(capsuleBottom, capsuleTop, pointOnRay)
    if (distanceSquared > PICK_RADIUS * PICK_RADIUS) continue
    const alongRay = pointOnRay.distanceTo(ray.origin)
    if (alongRay < nearestDistance) {
      nearestDistance = alongRay
      nearestIndex = target.agentIndex
    }
  }
  return nearestIndex
}

const PRIMARY_BUTTON = 0

/**
 * Clicks and hovers on the canvas: a click (a primary press that barely moved) reports the robot
 * under the pointer, or null for empty floor; hovering a robot shows the pointer cursor. Drags are
 * left to the camera controls.
 */
export class RobotPicking {
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private pressedAt: { pointerId: number; x: number; y: number } | null = null
  private isHovering = false
  private isDisposed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly targets: () => Iterable<PickTarget>,
    private readonly onPick: (agentIndex: number | null) => void,
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerleave", this.onPointerLeave)
  }

  /** Removes the listeners and the hover cursor. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointermove", this.onPointerMove)
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave)
    this.canvas.style.cursor = ""
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== PRIMARY_BUTTON) {
      this.pressedAt = null
      return
    }
    this.pressedAt = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    const pressedAt = this.pressedAt
    this.pressedAt = null
    if (!pressedAt || pressedAt.pointerId !== event.pointerId) return
    if (!isClick(pressedAt, { x: event.clientX, y: event.clientY })) return
    this.onPick(this.robotUnder(event))
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0) return
    this.setHovering(this.robotUnder(event) !== null)
  }

  private readonly onPointerLeave = () => {
    this.setHovering(false)
  }

  private setHovering(isHovering: boolean): void {
    if (isHovering === this.isHovering) return
    this.isHovering = isHovering
    this.canvas.style.cursor = isHovering ? "pointer" : ""
  }

  private robotUnder(event: PointerEvent): number | null {
    const bounds = this.canvas.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return null
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return pickRobot(this.raycaster.ray, this.targets())
  }
}
