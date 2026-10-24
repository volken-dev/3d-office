import type { OfficeExtras } from "@the-delegation/office-sim/office-extras"
import * as THREE from "three/webgpu"
import { easeColorToward } from "../color-easing"
import { isMesh, isStandardMaterial, materialsOf } from "../scene-graph-guards"

/** The office's status-light description from its scene extras. */
export type StatusColors = OfficeExtras["statusColors"]

const BYTES_PER_TEXEL = 4
const OPAQUE_BYTE = 255

/**
 * Writes one slot's colour into a W x 1 RGBA status texture: slot N is texel N-1, stored as sRGB
 * bytes (the texture is sampled as sRGB, so the light shows the status hex exactly).
 */
export function writeStatusTexel(data: Uint8Array, slot: number, color: THREE.Color): void {
  const offset = (slot - 1) * BYTES_PER_TEXEL
  const srgb = { r: 0, g: 0, b: 0 }
  color.getRGB(srgb, THREE.SRGBColorSpace)
  data[offset] = toByte(srgb.r)
  data[offset + 1] = toByte(srgb.g)
  data[offset + 2] = toByte(srgb.b)
  data[offset + 3] = OPAQUE_BYTE
}

function toByte(channel: number): number {
  return Math.round(THREE.MathUtils.clamp(channel, 0, 1) * 255)
}

interface StatusSlot {
  readonly current: THREE.Color
  readonly target: THREE.Color
}

/**
 * The pod and docking-bay lights. The office's `status_glow` material samples a W x 1 texture,
 * one texel per slot; this swaps it for a `DataTexture` the scene writes, so pod N and bay N show
 * slot N's status colour. A colour change eases in over a few frames; a slot with no robot shows
 * the office's `off` colour.
 */
export class StatusLights {
  public readonly texture: THREE.DataTexture
  private readonly data: Uint8Array
  private readonly offColor: THREE.Color
  private readonly slots: StatusSlot[]
  private isDisposed = false

  constructor(root: THREE.Object3D, statusColors: StatusColors) {
    this.offColor = new THREE.Color(statusColors.off)
    this.data = new Uint8Array(statusColors.width * BYTES_PER_TEXEL)
    this.slots = Array.from({ length: statusColors.width }, () => ({
      current: this.offColor.clone(),
      target: this.offColor.clone(),
    }))
    this.slots.forEach((slot, slotIndex) => {
      writeStatusTexel(this.data, slotIndex + 1, slot.current)
    })
    this.texture = new THREE.DataTexture(this.data, statusColors.width, 1, THREE.RGBAFormat)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.needsUpdate = true
    this.attachTo(root, statusColors.materials)
  }

  /** How many slots the texture has (the office's `statusColors.width`). */
  public get slotCount(): number {
    return this.slots.length
  }

  /** The colour slot N is easing toward, or null for a slot the texture does not have. */
  public targetOf(slot: number): THREE.Color | null {
    return this.slots[slot - 1]?.target ?? null
  }

  /** Sets the colour slot N eases to: a `#rrggbb` status colour, or null for the `off` colour. */
  public setSlotColor(slot: number, hex: string | null): void {
    const statusSlot = this.slots[slot - 1]
    if (!statusSlot) return
    if (hex === null) statusSlot.target.copy(this.offColor)
    else statusSlot.target.set(hex)
  }

  /** Eases every slot a frame toward its target, uploading the texture only when a texel moved. */
  public update(deltaSeconds: number): void {
    if (this.isDisposed) return
    let hasChanged = false
    this.slots.forEach((slot, slotIndex) => {
      if (!easeColorToward(slot.current, slot.target, deltaSeconds)) return
      writeStatusTexel(this.data, slotIndex + 1, slot.current)
      hasChanged = true
    })
    if (hasChanged) this.texture.needsUpdate = true
  }

  /** Frees the status texture. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.texture.dispose()
  }

  /**
   * Points each named material's colour and emissive maps at the status texture. The shipped
   * texture they replace was never drawn, so it is freed here.
   */
  private attachTo(root: THREE.Object3D, materialNames: readonly string[]): void {
    const names = new Set(materialNames)
    const attached = new Set<THREE.Material>()
    root.traverse((node) => {
      if (!isMesh(node)) return
      for (const material of materialsOf(node)) {
        if (!names.has(material.name) || attached.has(material)) continue
        if (!isStandardMaterial(material)) continue
        attached.add(material)
        if (material.map && material.map !== this.texture) material.map.dispose()
        material.map = this.texture
        if (material.emissiveMap) {
          if (material.emissiveMap !== this.texture) material.emissiveMap.dispose()
          material.emissiveMap = this.texture
        }
        material.needsUpdate = true
      }
    })
  }
}
