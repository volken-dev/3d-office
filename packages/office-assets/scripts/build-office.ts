import { mkdirSync } from "node:fs"
import path from "node:path"
import { NodeIO } from "@gltf-transform/core"
import { KHRLightsPunctual } from "@gltf-transform/extensions"
import { buildOfficeDocument } from "../src/office/build-office-document.ts"
import { readOfficeLayout } from "../src/office/office-layout-schema.ts"
import {
  DEFAULT_OFFICE_LAYOUT_PATH,
  DEFAULT_OFFICE_OUTPUT_PATH,
  OFFICE_TEXTURES_DIRECTORY,
} from "../src/office/office-paths.ts"

/**
 * Builds the raw office GLB. Run it under node (not bun, whose maths differs in the last bit):
 * `node --experimental-strip-types scripts/build-office.ts [out.glb]`, after
 * `build-office-textures`. Environment: LAYOUT (layout path), LOD=0 (authored tessellation),
 * TRIS=1 (triangles per item type), NAV_PNG=<path> (walk grid image), ZFIGHT=warn.
 */
const outputPath = path.resolve(process.argv[2] || DEFAULT_OFFICE_OUTPUT_PATH)
const result = await buildOfficeDocument({
  layout: readOfficeLayout(process.env.LAYOUT || DEFAULT_OFFICE_LAYOUT_PATH),
  texturesDirectory: OFFICE_TEXTURES_DIRECTORY,
  tessellateBySize: process.env.LOD !== "0",
  reportTriangles: Boolean(process.env.TRIS),
  zFighting: process.env.ZFIGHT === "warn" ? "warn" : "fail",
  walkGridImagePath: process.env.NAV_PNG || undefined,
  log: (line) => console.info(line),
})
mkdirSync(path.dirname(outputPath), { recursive: true })
await new NodeIO().registerExtensions([KHRLightsPunctual]).write(outputPath, result.document)
console.info("capacity", JSON.stringify(result.capacity))
console.info(
  "wrote",
  outputPath,
  `${result.drawCalls} draw calls (${result.paletteMaterials} materials in palette, ${result.screens} screens in atlas)`,
)
console.info(result.meshStats)
console.info("POIs", result.poiKinds)
