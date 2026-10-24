/**
 * Builds the minibot GLB: `node --experimental-strip-types scripts/build-minibot.ts [out.glb]`.
 * Runs under node, not bun, to keep V8's maths (and so the output bytes) exactly.
 */
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { NodeIO } from "@gltf-transform/core"
import { buildMinibot } from "../src/robot/minibot/build-minibot.ts"

const outputPath = process.argv[2] ?? resolve(import.meta.dirname, "..", "out/raw/minibot.glb")
const minibot = buildMinibot()
mkdirSync(dirname(outputPath), { recursive: true })
await new NodeIO().write(outputPath, minibot.document)
console.info("wrote", outputPath, minibot.summary)
