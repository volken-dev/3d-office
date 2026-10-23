/**
 * Builds the GLBs the scene loads (assets/models) from the exported sources (assets-src/models).
 * Run with `bun run assets` after adding or re-exporting a model. Every run starts from the sources, so
 * it is repeatable and idempotent: the same sources always produce the same bytes.
 *
 * The output stays visually identical to the sources:
 * - POSITION and TEXCOORD stay 32-bit floats. The scene reads raw geometry without its node transform
 *   (the navmesh, the instanced character parts and the head-skinned accessories), and quantized
 *   positions would move that transform onto the node. The expression atlas offsets UVs at runtime.
 * - NORMAL, JOINTS and WEIGHTS are quantized, then Meshopt's lossless QUANTIZE mode compresses every
 *   buffer, keyframes included, so no lossy filter touches normals or animation.
 * - Names, empty POI nodes, unused attributes and extras survive dedup and prune.
 */
import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { type Document, Logger, NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions"
import { dedup, prune, quantize, reorder, resample, weld } from "@gltf-transform/functions"
import draco3d from "draco3dgltf"
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer"

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..")
const SOURCE_DIR = path.join(PACKAGE_ROOT, "assets-src", "models")
const OUTPUT_DIR = path.join(PACKAGE_ROOT, "assets", "models")
const DRACO_EXTENSION = "KHR_draco_mesh_compression"

const QUANTIZED_ATTRIBUTES = /^(NORMAL|JOINTS_\d+|WEIGHTS_\d+)$/
const NORMAL_BITS = 12
const WEIGHT_BITS = 16

/** Keeps everything the scene looks up by name or reads directly, removing only unreferenced data. */
const KEEP_EVERYTHING_REFERENCED = {
  keepLeaves: true,
  keepAttributes: true,
  keepIndices: true,
  keepSolidTextures: true,
  keepExtras: true,
}

/** Reads Draco sources and writes Meshopt output; every glTF extension is registered so none is dropped. */
async function createIO(): Promise<NodeIO> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    })
}

/** Drops Draco from the document: its geometry is already decoded, and the output uses Meshopt instead. */
function removeDraco(document: Document): void {
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === DRACO_EXTENSION) extension.dispose()
  }
}

async function optimize(document: Document): Promise<void> {
  removeDraco(document)
  await document.transform(
    dedup({ keepUniqueNames: true }),
    prune(KEEP_EVERYTHING_REFERENCED),
    weld(),
    resample(),
    reorder({ encoder: MeshoptEncoder, target: "size" }),
    quantize({
      pattern: QUANTIZED_ATTRIBUTES,
      quantizeNormal: NORMAL_BITS,
      quantizeWeight: WEIGHT_BITS,
    }),
    prune(KEEP_EVERYTHING_REFERENCED),
  )
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
}

function formatKilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function main(): Promise<void> {
  const io = await createIO()
  const sourceNames = (await readdir(SOURCE_DIR)).filter((name) => name.endsWith(".glb")).sort()
  if (sourceNames.length === 0) throw new Error(`assets: no .glb sources in ${SOURCE_DIR}`)

  for (const sourceName of sourceNames) {
    const sourcePath = path.join(SOURCE_DIR, sourceName)
    const outputPath = path.join(OUTPUT_DIR, sourceName)
    const document = await io.read(sourcePath)
    await optimize(document)
    await io.write(outputPath, document)

    const [sourceStats, outputStats] = await Promise.all([stat(sourcePath), stat(outputPath)])
    console.log(
      `assets: ${sourceName} ${formatKilobytes(sourceStats.size)} -> ${formatKilobytes(outputStats.size)}`,
    )
  }
}

await main()
