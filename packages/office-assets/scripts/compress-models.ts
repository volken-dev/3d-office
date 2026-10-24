/**
 * Compresses the raw generator output (`out/raw/*.glb`) into the shipped models, see
 * `compressModel`. robot-lite's clips are compared with the robot's and stripped.
 * Usage: `bun run models:compress [name ...]` (default: robot robot-lite minibot office). Runs under
 * node, like the generators, so a rebuild reproduces the committed files byte for byte.
 */
import { statSync } from "node:fs"
import path from "node:path"
import { compressModel, stripClipsInFavourOf } from "../src/compress/compress-model.ts"
import { assertSameClips } from "../src/compress/shared-clips.ts"
import { createModelIo } from "../src/gltf-io.ts"
import {
  RAW_MODELS_DIRECTORY,
  SHIPPED_MODEL_PATHS,
  type ShippedModelName,
} from "../src/model-paths.ts"

const MODEL_NAMES = ["robot", "robot-lite", "minibot", "office"] as const
type ModelName = (typeof MODEL_NAMES)[number]

/** Models that ship without clips, and the model whose clips they play. */
const CLIPS_FROM: Partial<Record<ModelName, ModelName>> = { "robot-lite": "robot" }

function isModelName(name: string): name is ModelName {
  return MODEL_NAMES.some((modelName) => modelName === name)
}

function shippedName(name: ModelName): ShippedModelName {
  return `${name}.glb`
}

function kilobytes(bytes: number): string {
  return (bytes / 1024).toFixed(0)
}

const requested = process.argv.slice(2)
const unknown = requested.filter((name) => !isModelName(name))
if (unknown.length) throw new Error(`unknown model(s): ${unknown.join(", ")}`)
const names = requested.length ? requested.filter(isModelName) : MODEL_NAMES

const io = await createModelIo()
for (const name of names) {
  const source = path.join(RAW_MODELS_DIRECTORY, `${name}.glb`)
  const destination = SHIPPED_MODEL_PATHS[shippedName(name)]
  const document = await io.read(source)
  const clipSource = CLIPS_FROM[name]
  if (clipSource) {
    assertSameClips(document, await io.read(path.join(RAW_MODELS_DIRECTORY, `${clipSource}.glb`)))
    const clipCount = stripClipsInFavourOf(document, shippedName(clipSource))
    console.info(`${name}: ${clipCount} clips match ${clipSource}.glb, stripped`)
  }
  await compressModel(document)
  await io.write(destination, document)
  const rawBytes = statSync(source).size
  const shippedBytes = statSync(destination).size
  console.info(
    `${`${name}.glb`.padEnd(16)} ${kilobytes(rawBytes).padStart(5)} KB -> ${kilobytes(shippedBytes).padStart(4)} KB  (${((100 * shippedBytes) / rawBytes).toFixed(0)}%)`,
  )
}
