import * as THREE from "three/webgpu"
import { CHARACTER_Y_OFFSET, PICK_RADIUS, POI_PICK_RADIUS } from "../constants"
import type { PoiDef } from "../scene-types"

const DRAG_THRESHOLD_PX = 4
/** The y=0 plane, used for floor clicks when the office has no navmesh. */
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
/** Hover label height above the character's centre. */
const CHARACTER_LABEL_LIFT = 0.4
/** Hover label height above a POI. */
const POI_LABEL_LIFT = 0.5

type ScreenPosition = { x: number; y: number }

/**
 * Distance along the ray to its first hit on a sphere, or null when the ray misses. Points are
 * picked as spheres so they are easier to hit than a single point.
 */
function raySphereHitDistance(
  ray: THREE.Ray,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
): number | null {
  const originToCenterX = ray.origin.x - centerX
  const originToCenterY = ray.origin.y - centerY
  const originToCenterZ = ray.origin.z - centerZ

  const halfB =
    originToCenterX * ray.direction.x +
    originToCenterY * ray.direction.y +
    originToCenterZ * ray.direction.z
  const constantTerm =
    originToCenterX * originToCenterX +
    originToCenterY * originToCenterY +
    originToCenterZ * originToCenterZ -
    radius * radius
  const discriminant = halfB * halfB - constantTerm

  if (discriminant < 0) return null
  return -halfB - Math.sqrt(discriminant)
}

export interface InputCallbacks {
  /** Agent indices of every pickable character. */
  getAgentIndices(): readonly number[]
  /** Writes a character's position into `out`; false when it has none. */
  getPosition(agentIndex: number, out: THREE.Vector3): boolean
  getPois(): Iterable<PoiDef>
  isPointValid(point: THREE.Vector3): boolean
  onSelect(index: number | null): void
  onFloorClick(x: number, z: number): void
  onHover(index: number | null, position: ScreenPosition | null): void
  onPoiHover(id: string | null, label: string | null, position: ScreenPosition | null): void
  onPoiClick(id: string): void
}

/**
 * Turns canvas pointer events into character, POI and floor picks. Picking is done against the
 * CPU position mirror (no scene raycast against skinned meshes), and hover work is throttled to
 * one pass per animation frame.
 */
export class InputManager {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private readonly projected = new THREE.Vector3()
  private readonly characterPosition = new THREE.Vector3()
  private readonly planeHit = new THREE.Vector3()
  private readonly hits: THREE.Intersection[] = []
  private dragStartX = 0
  private dragStartY = 0
  private isDragging = false
  /** Hover work runs at most once per frame, on the latest pointer position. */
  private pendingHover: PointerEvent | null = null
  private hoverFrame = 0

  public selectedIndex: number | null = null

  /**
   * @param floorMeshes Walkable meshes (the hidden navmesh). Clicks elsewhere are ignored;
   *                    when empty, the y=0 plane is used instead.
   */
  constructor(
    private canvas: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private floorMeshes: THREE.Object3D[],
    private callbacks: InputCallbacks,
  ) {
    canvas.addEventListener("pointerdown", this.handlePointerDown)
    canvas.addEventListener("pointermove", this.handlePointerMove)
    canvas.addEventListener("pointerup", this.handlePointerUp)
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    this.dragStartX = event.clientX
    this.dragStartY = event.clientY
    this.isDragging = false
  }

  /** While a button is held, only dragging is tracked: hover updates would fight OrbitControls. */
  private handlePointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0) {
      if (event.buttons === 1) {
        const deltaX = event.clientX - this.dragStartX
        const deltaY = event.clientY - this.dragStartY
        if (deltaX * deltaX + deltaY * deltaY > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          this.isDragging = true
        }
      }
      this.pendingHover = null
      return
    }

    this.isDragging = false
    this.pendingHover = event
    if (!this.hoverFrame) this.hoverFrame = requestAnimationFrame(this.flushHover)
  }

  private flushHover = () => {
    this.hoverFrame = 0
    const event = this.pendingHover
    this.pendingHover = null
    if (event) this.updateHover(event)
  }

  private setPointer(event: PointerEvent): DOMRect {
    const canvasBounds = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1
    this.pointer.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1
    return canvasBounds
  }

  /** Projects a world position to canvas pixels. */
  private toScreen(x: number, y: number, z: number, canvasBounds: DOMRect): ScreenPosition {
    const projected = this.projected.set(x, y, z).project(this.camera)
    return {
      x: (projected.x * 0.5 + 0.5) * canvasBounds.width,
      y: (projected.y * -0.5 + 0.5) * canvasBounds.height,
    }
  }

  /** While an NPC is selected, only that NPC can be hovered. */
  private updateHover(event: PointerEvent) {
    const canvasBounds = this.setPointer(event)
    const { onHover, onPoiHover } = this.callbacks
    const hoveredIndex = this.getAgentAtPointer()

    const effectiveHoverIndex =
      this.selectedIndex !== null && hoveredIndex !== this.selectedIndex ? null : hoveredIndex

    if (effectiveHoverIndex !== null) {
      this.canvas.style.cursor = "pointer"
      const position = this.characterPosition
      if (this.callbacks.getPosition(effectiveHoverIndex, position)) {
        onPoiHover(null, null, null)
        onHover(
          effectiveHoverIndex,
          this.toScreen(
            position.x,
            position.y + CHARACTER_Y_OFFSET + CHARACTER_LABEL_LIFT,
            position.z,
            canvasBounds,
          ),
        )
      }
      return
    }

    const hoveredPoi = this.getPoiAtPointer()
    if (hoveredPoi && hoveredPoi.occupiedBy === null && hoveredPoi.label) {
      this.canvas.style.cursor = "pointer"
      const { x, y, z } = hoveredPoi.position
      onHover(null, null)
      onPoiHover(
        hoveredPoi.id,
        hoveredPoi.label,
        this.toScreen(x, y + POI_LABEL_LIFT, z, canvasBounds),
      )
      return
    }

    this.canvas.style.cursor = this.getWorldClickPosition() ? "pointer" : "auto"
    onHover(null, null)
    onPoiHover(null, null, null)
  }

  private getAgentAtPointer(): number | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const ray = this.raycaster.ray
    const position = this.characterPosition
    let closestDistance = Infinity
    let closestIndex: number | null = null

    for (const agentIndex of this.callbacks.getAgentIndices()) {
      if (!this.callbacks.getPosition(agentIndex, position)) continue
      const hitDistance = raySphereHitDistance(
        ray,
        position.x,
        position.y + CHARACTER_Y_OFFSET,
        position.z,
        PICK_RADIUS,
      )
      if (hitDistance === null) continue

      if (hitDistance > 0 && hitDistance < closestDistance) {
        closestDistance = hitDistance
        closestIndex = agentIndex
      }
    }
    return closestIndex
  }

  private getPoiAtPointer(): PoiDef | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    let closestDistance = Infinity
    let closestPoi: PoiDef | null = null

    for (const poi of this.callbacks.getPois()) {
      if (!poi.label) continue

      const hitDistance = raySphereHitDistance(
        this.raycaster.ray,
        poi.position.x,
        poi.position.y,
        poi.position.z,
        POI_PICK_RADIUS,
      )
      if (hitDistance === null) continue

      if (hitDistance > 0 && hitDistance < closestDistance) {
        closestDistance = hitDistance
        closestPoi = poi
      }
    }

    return closestPoi
  }

  private handlePointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || this.isDragging) return
    this.handleClick(event)
  }

  /**
   * Clicking the selected character deselects it; clicking another selects it. With a character
   * selected, the first click on empty space only clears the selection.
   */
  private handleClick(event: PointerEvent) {
    this.setPointer(event)
    const { onSelect, onPoiHover, onPoiClick, onFloorClick } = this.callbacks

    const closestIndex = this.getAgentAtPointer()

    if (closestIndex !== null) {
      if (closestIndex === this.selectedIndex) {
        this.selectedIndex = null
        onSelect(null)
      } else {
        this.selectedIndex = closestIndex
        onSelect(closestIndex)
      }
    } else {
      const hoveredPoi = this.getPoiAtPointer()

      if (hoveredPoi && hoveredPoi.occupiedBy === null && hoveredPoi.label) {
        onPoiHover(null, null, null)
        onPoiClick(hoveredPoi.id)
      } else if (this.selectedIndex !== null) {
        this.selectedIndex = null
        onSelect(null)
      } else {
        const target = this.getWorldClickPosition()
        if (target) onFloorClick(target.x, target.z)
      }
    }
  }

  /** Walkable point under the pointer, or null. The returned vector is reused between calls. */
  private getWorldClickPosition(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)

    let point: THREE.Vector3 | null = null
    if (this.floorMeshes.length > 0) {
      this.hits.length = 0
      this.raycaster.intersectObjects(this.floorMeshes, false, this.hits)
      point = this.hits[0]?.point ?? null
    } else if (this.raycaster.ray.intersectPlane(FLOOR_PLANE, this.planeHit)) {
      point = this.planeHit
    }

    return point && this.callbacks.isPointValid(point) ? point : null
  }

  public dispose() {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown)
    this.canvas.removeEventListener("pointermove", this.handlePointerMove)
    this.canvas.removeEventListener("pointerup", this.handlePointerUp)
    cancelAnimationFrame(this.hoverFrame)
    this.hoverFrame = 0
    this.pendingHover = null
  }
}
