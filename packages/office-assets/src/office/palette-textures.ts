import sharp from "sharp"
import { isPaletteMaterial } from "./draw-call-buckets.ts"
import { colorBytes, officeMaterial, STATUS_OFF_COLOR } from "./office-materials.ts"
import type { Vector2 } from "./vector-math.ts"

/** Each palette material is a cell of this many pixels square, sampled at its centre. */
const PALETTE_CELL = 4
/** Cells per palette row (and rows per palette): up to 64 materials. */
const PALETTE_COLUMNS = 8
const PALETTE_SIZE = PALETTE_CELL * PALETTE_COLUMNS

/**
 * The merged flat-colour materials: their sorted names, each one's UV (its cell's centre) and the
 * three nearest-filtered textures, as PNGs: base colour, metal-roughness (G roughness, B metal)
 * and emissive (the colour for emissive materials, else black).
 */
export interface PaletteTextures {
  names: string[]
  uvs: Map<string, Vector2>
  color: Uint8Array
  metallicRoughness: Uint8Array
  emissive: Uint8Array
}

/** Encodes raw RGB pixels as a maximally compressed PNG. */
export function rawRgbPng(pixels: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * Packs every flat-colour material in use into the palette textures, in name order, one 4 x 4
 * cell per material.
 */
export async function buildPaletteTextures(
  materialsInUse: Iterable<string>,
): Promise<PaletteTextures> {
  const names = [...materialsInUse].filter(isPaletteMaterial).sort()
  if (names.length > PALETTE_COLUMNS * PALETTE_COLUMNS) throw new Error("palette full")
  const uvs = new Map<string, Vector2>()
  const pixelCount = PALETTE_SIZE * PALETTE_SIZE * 3
  const color = Buffer.alloc(pixelCount)
  const metallicRoughness = Buffer.alloc(pixelCount)
  const emissive = Buffer.alloc(pixelCount)
  names.forEach((name, k) => {
    const definition = officeMaterial(name)
    const cellX = (k % PALETTE_COLUMNS) * PALETTE_CELL
    const cellY = Math.floor(k / PALETTE_COLUMNS) * PALETTE_CELL
    const rgb = colorBytes(definition.color ?? 0xffffff)
    const metalRough = [
      255,
      Math.round((definition.roughness ?? 0.7) * 255),
      Math.round((definition.metalness ?? 0) * 255),
    ]
    for (let y = cellY; y < cellY + PALETTE_CELL; y++) {
      for (let x = cellX; x < cellX + PALETTE_CELL; x++) {
        const offset = (y * PALETTE_SIZE + x) * 3
        color.set(rgb, offset)
        metallicRoughness.set(metalRough, offset)
        emissive.set(definition.emissive ? rgb : [0, 0, 0], offset)
      }
    }
    uvs.set(name, [
      (cellX + PALETTE_CELL / 2) / PALETTE_SIZE,
      (cellY + PALETTE_CELL / 2) / PALETTE_SIZE,
    ])
  })
  const [colorPng, metallicRoughnessPng, emissivePng] = await Promise.all([
    rawRgbPng(color, PALETTE_SIZE, PALETTE_SIZE),
    rawRgbPng(metallicRoughness, PALETTE_SIZE, PALETTE_SIZE),
    rawRgbPng(emissive, PALETTE_SIZE, PALETTE_SIZE),
  ])
  return {
    names,
    uvs,
    color: colorPng,
    metallicRoughness: metallicRoughnessPng,
    emissive: emissivePng,
  }
}

/**
 * The default status texture `status_colors`: `width` x 1 texels, all the dim "no agent" colour.
 * The product swaps in its own texture and writes agent N's status colour to texel N-1.
 */
export function buildStatusTexture(width: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * 3)
  for (let k = 0; k < width; k++) pixels.set(colorBytes(STATUS_OFF_COLOR), k * 3)
  return rawRgbPng(pixels, width, 1)
}
