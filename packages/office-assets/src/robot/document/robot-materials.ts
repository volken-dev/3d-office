import type { Document, Material } from "@gltf-transform/core"
import {
  isEmissiveMaterial,
  type MaterialName,
  materialMetallic,
  materialRoughness,
  type Palette,
} from "../material-palette.ts"
import { srgbToLinear } from "../srgb-to-linear.ts"

/**
 * Returns a function that creates each palette material on first use and reuses it after, so
 * materials appear in the file in the order primitives first need them. Eye parts are double
 * sided: the status glyphs and the face are single sheets.
 */
export function createMaterialCache(
  document: Document,
  palette: Readonly<Palette>,
): (name: MaterialName) => Material {
  const materials = new Map<MaterialName, Material>()
  return (name) => {
    const existing = materials.get(name)
    if (existing) return existing
    const [red, green, blue] = srgbToLinear(palette[name])
    const material = document
      .createMaterial(name)
      .setBaseColorFactor([red, green, blue, 1])
      .setMetallicFactor(materialMetallic(name))
      .setRoughnessFactor(materialRoughness(name))
    if (isEmissiveMaterial(name)) material.setEmissiveFactor([red, green, blue])
    if (name === "eye") material.setDoubleSided(true)
    materials.set(name, material)
    return material
  }
}
