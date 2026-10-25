import { readFileSync } from "node:fs"
import path from "node:path"
import { type Document, type Material, type Texture, TextureInfo } from "@gltf-transform/core"
import { officeMaterial } from "./office-materials.ts"

/** The generated images the merged materials sample. */
export interface GeneratedImages {
  paletteColor: Uint8Array
  paletteMetallicRoughness: Uint8Array
  paletteEmissive: Uint8Array
  statusColors: Uint8Array
  screenAtlas: Uint8Array
}

/** The sRGB channel value (0 to 1) in linear light. */
function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** A 0xRRGGBB sRGB colour as linear `[r, g, b]`, as glTF colour factors expect. */
function hexToLinear(color: number): [number, number, number] {
  const [red, green, blue] = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map(
    (channel) => channel / 255,
  )
  return [srgbChannelToLinear(red), srgbChannelToLinear(green), srgbChannelToLinear(blue)]
}

function nearestFiltered(info: TextureInfo | null): void {
  if (info === null) throw new Error("expected a texture info to set nearest filtering on")
  info.setMagFilter(TextureInfo.MagFilter.NEAREST).setMinFilter(TextureInfo.MinFilter.NEAREST)
}

/**
 * Creates the document's materials and textures on first use, each once, in first-use order (which
 * is their order in the GLB). The merged materials: `palette` (nearest-filtered colour,
 * metal-rough and emissive cells), `status_glow` (the status texture as colour and emission) and
 * `screens` (the atlas as emission). Every other material comes from the office material table.
 */
export function createMaterialFactory(
  document: Document,
  images: GeneratedImages,
  texturesDirectory: string,
): (name: string) => Material {
  const textures = new Map<string, Texture>()
  const materials = new Map<string, Material>()
  const texture = (name: string, image?: Uint8Array): Texture => {
    let created = textures.get(name)
    if (created === undefined) {
      created = document
        .createTexture(name)
        .setImage(image ?? readFileSync(path.join(texturesDirectory, `${name}.png`)))
        .setMimeType("image/png")
      textures.set(name, created)
    }
    return created
  }
  const create = (name: string): Material => {
    if (name === "palette") {
      const palette = document
        .createMaterial("palette")
        .setBaseColorTexture(texture("palette_color", images.paletteColor))
        .setMetallicRoughnessTexture(texture("palette_mr", images.paletteMetallicRoughness))
        .setEmissiveTexture(texture("palette_emissive", images.paletteEmissive))
        .setEmissiveFactor([1, 1, 1])
        .setRoughnessFactor(1)
        .setMetallicFactor(1)
      for (const info of [
        palette.getBaseColorTextureInfo(),
        palette.getMetallicRoughnessTextureInfo(),
        palette.getEmissiveTextureInfo(),
      ]) {
        nearestFiltered(info)
      }
      return palette
    }
    if (name === "status_glow") {
      const status = document
        .createMaterial(name)
        .setBaseColorTexture(texture("status_colors", images.statusColors))
        .setRoughnessFactor(0.6)
        .setMetallicFactor(0)
      nearestFiltered(status.getBaseColorTextureInfo())
      nearestFiltered(
        status
          .setEmissiveTexture(texture("status_colors"))
          .setEmissiveFactor([1, 1, 1])
          .getEmissiveTextureInfo(),
      )
      return status
    }
    if (name === "screens") {
      return document
        .createMaterial("screens")
        .setBaseColorFactor([0, 0, 0, 1])
        .setEmissiveTexture(texture("screens_atlas", images.screenAtlas))
        .setEmissiveFactor([1, 1, 1])
        .setRoughnessFactor(0.3)
        .setMetallicFactor(0)
    }
    const definition = officeMaterial(name)
    const material = document
      .createMaterial(name)
      .setRoughnessFactor(definition.roughness ?? 0.7)
      .setMetallicFactor(definition.metalness ?? 0)
    if (definition.emissiveTexture) {
      if (definition.texture === undefined)
        throw new Error(`screen material ${name} has no texture`)
      material
        .setBaseColorFactor([0, 0, 0, 1])
        .setEmissiveTexture(texture(definition.texture))
        .setEmissiveFactor([1, 1, 1])
        .setRoughnessFactor(0.3)
    } else {
      const linear = hexToLinear(definition.color ?? 0xffffff)
      material.setBaseColorFactor([...linear, definition.alpha ?? 1])
      if (definition.texture) material.setBaseColorTexture(texture(definition.texture))
      if (definition.emissive) material.setEmissiveFactor(linear)
      if (definition.alpha !== undefined) material.setAlphaMode("BLEND").setDoubleSided(true)
    }
    return material
  }
  return (name) => {
    let material = materials.get(name)
    if (material === undefined) {
      material = create(name)
      materials.set(name, material)
    }
    return material
  }
}
