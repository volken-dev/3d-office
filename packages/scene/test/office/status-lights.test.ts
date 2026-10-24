import { describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import { type StatusColors, StatusLights, writeStatusTexel } from "../../src/office/status-lights"

const STATUS_COLORS: StatusColors = {
  texture: "status_colors",
  width: 4,
  desks: 3,
  materials: ["status_glow"],
  colors: { green: "#2fbf71", red: "#e5484d" },
  off: "#4a505c",
}

function texel(data: Uint8Array, slot: number): number[] {
  return Array.from(data.slice((slot - 1) * 4, slot * 4))
}

function hexBytes(hex: string): number[] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255]
}

function officeWithStatusMaterial(): {
  root: THREE.Group
  material: THREE.MeshStandardMaterial
  shipped: THREE.Texture
} {
  const shipped = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: shipped, emissiveMap: shipped })
  material.name = "status_glow"
  const root = new THREE.Group()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
  return { root, material, shipped }
}

function dataOf(lights: StatusLights): Uint8Array {
  const data = lights.texture.image.data
  if (!(data instanceof Uint8Array)) throw new Error("the status texture holds no bytes")
  return data
}

describe("writeStatusTexel", () => {
  test("writes slot N into texel N-1 as the sRGB bytes of the hex colour", () => {
    const data = new Uint8Array(16)
    writeStatusTexel(data, 3, new THREE.Color("#2fbf71"))
    expect(texel(data, 3)).toEqual(hexBytes("#2fbf71"))
    expect(texel(data, 1)).toEqual([0, 0, 0, 0])
    expect(texel(data, 4)).toEqual([0, 0, 0, 0])
  })
})

describe("StatusLights", () => {
  test("replaces the status material's maps with a nearest-filtered sRGB texture, all off", () => {
    const { root, material } = officeWithStatusMaterial()
    const lights = new StatusLights(root, STATUS_COLORS)
    expect(material.map).toBe(lights.texture)
    expect(material.emissiveMap).toBe(lights.texture)
    expect(lights.texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(lights.texture.magFilter).toBe(THREE.NearestFilter)
    expect(lights.slotCount).toBe(4)
    for (let slot = 1; slot <= 4; slot++) {
      expect(texel(dataOf(lights), slot)).toEqual(hexBytes(STATUS_COLORS.off))
    }
  })

  test("a slot eases to its status colour and back to off, leaving the others alone", () => {
    const { root } = officeWithStatusMaterial()
    const lights = new StatusLights(root, STATUS_COLORS)
    lights.setSlotColor(2, "#e5484d")
    lights.update(1 / 60)
    const halfway = texel(dataOf(lights), 2)
    expect(halfway).not.toEqual(hexBytes(STATUS_COLORS.off))
    expect(halfway).not.toEqual(hexBytes("#e5484d"))
    for (let frame = 0; frame < 120; frame++) lights.update(1 / 60)
    expect(texel(dataOf(lights), 2)).toEqual(hexBytes("#e5484d"))
    expect(texel(dataOf(lights), 1)).toEqual(hexBytes(STATUS_COLORS.off))
    expect(texel(dataOf(lights), 3)).toEqual(hexBytes(STATUS_COLORS.off))

    lights.setSlotColor(2, null)
    for (let frame = 0; frame < 120; frame++) lights.update(1 / 60)
    expect(texel(dataOf(lights), 2)).toEqual(hexBytes(STATUS_COLORS.off))
  })

  test("a slot the texture does not have is ignored", () => {
    const { root } = officeWithStatusMaterial()
    const lights = new StatusLights(root, STATUS_COLORS)
    lights.setSlotColor(0, "#2fbf71")
    lights.setSlotColor(5, "#2fbf71")
    expect(lights.targetOf(5)).toBeNull()
    lights.update(1)
    for (let slot = 1; slot <= 4; slot++) {
      expect(texel(dataOf(lights), slot)).toEqual(hexBytes(STATUS_COLORS.off))
    }
  })
})
