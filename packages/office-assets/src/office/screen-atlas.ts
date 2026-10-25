import path from "node:path"
import sharp from "sharp"
import { officeMaterial } from "./office-materials.ts"

/** The atlas width; its height is the next power of two that fits the packed rows. */
const ATLAS_WIDTH = 1024
/** Gap between packed images, so filtering never bleeds one screen into the next. */
const ATLAS_PADDING = 8

/**
 * The screen atlas: material `screens`, every monitor face's texture in one image. `rects` gives
 * each screen material its `[u0, v0, u1, v1]` (scene extras `screenAtlas`), in name order.
 */
export interface ScreenAtlas {
  rects: Record<string, number[]>
  png: Buffer
}

interface PackedScreen {
  material: string
  file: string
  width: number
  height: number
  x: number
  y: number
}

/**
 * Shelf-packs the screen textures (tallest first, left to right, a new shelf when a row is full)
 * into one power-of-two-high image on black.
 */
export async function packScreenAtlas(
  screenMaterials: string[],
  texturesDirectory: string,
): Promise<ScreenAtlas> {
  const screens: PackedScreen[] = await Promise.all(
    screenMaterials.map(async (material) => {
      const file = path.join(texturesDirectory, `${officeMaterial(material).texture}.png`)
      const metadata = await sharp(file).metadata()
      if (metadata.width === undefined || metadata.height === undefined) {
        throw new Error(`${file} has no size`)
      }
      return { material, file, width: metadata.width, height: metadata.height, x: 0, y: 0 }
    }),
  )
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const screen of [...screens].sort((a, b) => b.height - a.height)) {
    if (cursorX + screen.width > ATLAS_WIDTH) {
      cursorX = 0
      cursorY += rowHeight + ATLAS_PADDING
      rowHeight = 0
    }
    screen.x = cursorX
    screen.y = cursorY
    cursorX += screen.width + ATLAS_PADDING
    rowHeight = Math.max(rowHeight, screen.height)
  }
  const atlasHeight = 2 ** Math.ceil(Math.log2(Math.max(1, cursorY + rowHeight)))
  const rects: Record<string, number[]> = {}
  for (const screen of screens) {
    rects[screen.material] = [
      screen.x / ATLAS_WIDTH,
      screen.y / atlasHeight,
      (screen.x + screen.width) / ATLAS_WIDTH,
      (screen.y + screen.height) / atlasHeight,
    ].map((value) => Number(value.toFixed(6)))
  }
  const png = await sharp({
    create: { width: ATLAS_WIDTH, height: atlasHeight, channels: 3, background: "#000" },
  })
    .composite(screens.map((screen) => ({ input: screen.file, left: screen.x, top: screen.y })))
    .png({ compressionLevel: 9 })
    .toBuffer()
  return { rects, png }
}
