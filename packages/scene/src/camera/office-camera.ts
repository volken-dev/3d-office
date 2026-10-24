import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import * as THREE from "three/webgpu"

const FIELD_OF_VIEW = 32
const FAR_PLANE = 200
const MIN_DISTANCE = 0.8
const MAX_DISTANCE = 34
const MIN_POLAR_ANGLE = 0.3
const MAX_POLAR_ANGLE = 1.3
const DAMPING_FACTOR = 0.12
/** The near plane follows the zoom, so overview distances keep their depth precision (no z-fighting). */
const NEAR_PLANE_PER_METRE = 0.02
const MIN_NEAR_PLANE = 0.05
const MAX_NEAR_PLANE = 0.5

/** The overview looks down from +X/+Z, the side whose walls are low cutaways. */
const OVERVIEW_DIRECTION = new THREE.Vector3(1, 1.12, 1).normalize()
/** The heights of the office the overview frames: plinth to just above the tall walls. */
const OVERVIEW_MIN_HEIGHT = -0.3
const OVERVIEW_MAX_HEIGHT = 2.4
const OVERVIEW_MARGIN = 1.05
/** The viewer nudges its overview slightly toward the target. */
const OVERVIEW_PULL_IN = 0.02

/** Following a robot looks at its chest from this far away. */
const FOLLOW_DISTANCE = 6
const FOLLOW_TARGET_HEIGHT = 0.6
/** Per-second rate of the camera's eases (onto a robot, back to the overview). */
const EASE_RATE = 4
const SETTLED_DISTANCE = 0.02

/** Wheel handling, from the agent-office viewer. */
const PINCH_ZOOM_PER_DELTA = 0.012
const NOTCHED_ZOOM_STEP = 1.12
const NOTCHED_MIN_DELTA = 50
const PAN_PER_PIXEL_PER_METRE = 0.0008

type CameraTransition = "none" | "overview" | "zoomToFollow"

/**
 * The overhead camera and its controls, as in the agent-office viewer: drag pans, right-drag or
 * shift-drag turns, pinch (ctrl-wheel) and a notched wheel zoom, two-finger trackpad scroll pans,
 * and touch pans with one finger and zooms and turns with two. It opens on an overview of the
 * office from +X/+Z; following a robot eases the target onto it every frame and zooms in once, and
 * `showOverview` eases back. Any drag or wheel cancels an ease in progress, never the follow.
 */
export class OfficeCamera {
  public readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly bounds = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2, 3))
  private readonly overviewTarget = new THREE.Vector3()
  private readonly overviewPosition = new THREE.Vector3()
  private readonly followTarget = new THREE.Vector3()
  private readonly offset = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private transition: CameraTransition = "none"
  private isDisposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, MIN_NEAR_PLANE, FAR_PLANE)
    canvas.addEventListener("wheel", this.onWheel, { capture: true, passive: false })
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = DAMPING_FACTOR
    this.controls.minDistance = MIN_DISTANCE
    this.controls.maxDistance = MAX_DISTANCE
    this.controls.minPolarAngle = MIN_POLAR_ANGLE
    this.controls.maxPolarAngle = MAX_POLAR_ANGLE
    this.controls.screenSpacePanning = false
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
    this.controls.addEventListener("start", this.onControlsStart)
    this.computeOverview()
    this.jumpToOverview()
  }

  /** Frames the overview on the loaded office's bounds and moves the camera there at once. */
  public setBounds(bounds: THREE.Box3): void {
    this.bounds.copy(bounds)
    this.computeOverview()
    this.jumpToOverview()
  }

  /** Matches the camera to the canvas's size; the overview is reframed for the new aspect. */
  public resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.computeOverview()
  }

  /** Starts following: the next frames zoom in on the followed robot. */
  public startFollowing(): void {
    this.transition = "zoomToFollow"
  }

  /** Eases the camera back to the overview. */
  public showOverview(): void {
    this.transition = "overview"
  }

  /**
   * One frame: eases toward the followed robot (its floor position, or null when following none)
   * or the overview, then applies the controls' damping and the zoom-dependent near plane.
   */
  public update(deltaSeconds: number, followed: THREE.Vector3 | null): void {
    if (this.isDisposed) return
    const ease = 1 - Math.exp(-deltaSeconds * EASE_RATE)
    if (followed) this.easeOntoRobot(followed, ease)
    else if (this.transition === "overview") this.easeToOverview(ease)
    this.controls.update(deltaSeconds)
    this.updateNearPlane()
  }

  /** Removes the controls and the wheel listener. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.canvas.removeEventListener("wheel", this.onWheel, { capture: true })
    this.controls.removeEventListener("start", this.onControlsStart)
    this.controls.dispose()
  }

  private easeOntoRobot(followed: THREE.Vector3, ease: number): void {
    this.followTarget.set(followed.x, followed.y + FOLLOW_TARGET_HEIGHT, followed.z)
    this.offset.subVectors(this.followTarget, this.controls.target).multiplyScalar(ease)
    this.controls.target.add(this.offset)
    this.camera.position.add(this.offset)
    if (this.transition !== "zoomToFollow") return
    this.offset.subVectors(this.camera.position, this.controls.target)
    const distance = this.offset.length()
    const nextDistance = THREE.MathUtils.lerp(distance, FOLLOW_DISTANCE, ease)
    this.camera.position.copy(this.controls.target).add(this.offset.setLength(nextDistance))
    if (Math.abs(nextDistance - FOLLOW_DISTANCE) < SETTLED_DISTANCE) this.transition = "none"
  }

  private easeToOverview(ease: number): void {
    this.controls.target.lerp(this.overviewTarget, ease)
    this.camera.position.lerp(this.overviewPosition, ease)
    const isSettled =
      this.controls.target.distanceTo(this.overviewTarget) < SETTLED_DISTANCE &&
      this.camera.position.distanceTo(this.overviewPosition) < SETTLED_DISTANCE
    if (isSettled) this.transition = "none"
  }

  /** The viewer's `overhead()`: the office's floor-to-wall box, framed from +X/+Z. */
  private computeOverview(): void {
    const framed = this.bounds.clone()
    framed.min.y = Math.max(framed.min.y, OVERVIEW_MIN_HEIGHT)
    framed.max.y = Math.min(framed.max.y, OVERVIEW_MAX_HEIGHT)
    const center = framed.getCenter(new THREE.Vector3())
    const size = framed.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.5
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov)
    const narrowestFov = Math.min(verticalFov, verticalFov * this.camera.aspect)
    const distance = Math.min((radius / Math.sin(narrowestFov / 2)) * OVERVIEW_MARGIN, MAX_DISTANCE)
    this.overviewTarget.copy(center)
    this.overviewPosition
      .copy(center)
      .addScaledVector(OVERVIEW_DIRECTION, distance)
      .lerp(center, OVERVIEW_PULL_IN)
  }

  private jumpToOverview(): void {
    this.transition = "none"
    this.controls.target.copy(this.overviewTarget)
    this.camera.position.copy(this.overviewPosition)
    this.controls.update()
    this.updateNearPlane()
  }

  private updateNearPlane(): void {
    const near = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target) * NEAR_PLANE_PER_METRE,
      MIN_NEAR_PLANE,
      MAX_NEAR_PLANE,
    )
    if (Math.abs(near - this.camera.near) < 1e-3) return
    this.camera.near = near
    this.camera.updateProjectionMatrix()
  }

  private readonly onControlsStart = () => {
    this.transition = "none"
  }

  /**
   * Trackpad-friendly wheel: ctrl-wheel (a pinch) zooms smoothly, a notched mouse wheel zooms in
   * steps, and a two-finger scroll pans across the floor. Runs in the capture phase and stops the
   * event, so the orbit controls' own wheel zoom never runs as well.
   */
  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.transition = "none"
    const isNotched =
      event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
      (event.deltaX === 0 &&
        Math.abs(event.deltaY) >= NOTCHED_MIN_DELTA &&
        Number.isInteger(event.deltaY))
    if (event.ctrlKey || event.metaKey) this.zoomBy(Math.exp(event.deltaY * PINCH_ZOOM_PER_DELTA))
    else if (isNotched) this.zoomBy(event.deltaY > 0 ? NOTCHED_ZOOM_STEP : 1 / NOTCHED_ZOOM_STEP)
    else this.panBy(event.deltaX, event.deltaY)
  }

  private zoomBy(factor: number): void {
    this.offset.subVectors(this.camera.position, this.controls.target)
    const distance = THREE.MathUtils.clamp(
      this.offset.length() * factor,
      MIN_DISTANCE,
      MAX_DISTANCE,
    )
    this.camera.position.copy(this.controls.target).add(this.offset.setLength(distance))
  }

  private panBy(deltaX: number, deltaY: number): void {
    const metresPerPixel =
      this.camera.position.distanceTo(this.controls.target) * PAN_PER_PIXEL_PER_METRE
    this.camera.getWorldDirection(this.forward)
    this.forward.y = 0
    this.forward.normalize()
    this.right.crossVectors(this.forward, this.camera.up).normalize()
    this.offset
      .copy(this.right)
      .multiplyScalar(deltaX * metresPerPixel)
      .addScaledVector(this.forward, -deltaY * metresPerPixel)
    this.controls.target.add(this.offset)
    this.camera.position.add(this.offset)
    this.clampTarget()
  }

  /** Keeps the target over the office, moving the camera with it. */
  private clampTarget(): void {
    const target = this.controls.target
    const clampedX = THREE.MathUtils.clamp(target.x, this.bounds.min.x, this.bounds.max.x)
    const clampedZ = THREE.MathUtils.clamp(target.z, this.bounds.min.z, this.bounds.max.z)
    this.camera.position.x += clampedX - target.x
    this.camera.position.z += clampedZ - target.z
    target.x = clampedX
    target.z = clampedZ
  }
}
