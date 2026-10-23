/**
 * Stamps the POI extras (`OfficePoiExtrasSchema`) onto the office source GLB, derived from the
 * legacy `poi-<state>-<id>` node names it was exported with. Run once with
 * `bun scripts/add-poi-extras.ts`, then `bun run assets`; the stamped source is committed.
 *
 * Rerun it after re-exporting the office from a Blender file that still has only the names: nodes
 * that already carry a `poi` extra are left alone, so it is idempotent. Once the Blender file has
 * the custom properties itself, this script is no longer needed.
 *
 * Only the GLB's JSON chunk is rewritten. Its binary chunk, the Draco-compressed geometry, is
 * copied byte for byte, which a round trip through a glTF Transform document could not do without
 * re-encoding it.
 */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { type OfficePoiExtras, OfficePoiExtrasSchema } from "../src/world/office-poi-extras"

const OFFICE_SOURCE = path.resolve(import.meta.dirname, "..", "assets-src", "models", "office.glb")

const GLB_MAGIC = 0x46546c67
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_CHUNK_TYPE = 0x4e4f534a

/** The legacy name patterns, each mapped to the extras it stands for. */
const LEGACY_NAME_RULES: { pattern: RegExp; toExtras: (key: string) => OfficePoiExtras }[] = [
  { pattern: /^poi-idle-spawn-(\d+)$/, toExtras: (key) => ({ poi: "spawn", slot: Number(key) }) },
  { pattern: /^poi-sit_work-(\d+)$/, toExtras: (key) => ({ poi: "desk", slot: Number(key) }) },
  { pattern: /^poi-sit_idle-(\d+)$/, toExtras: (key) => ({ poi: "seat", slot: Number(key) }) },
  { pattern: /^poi-idle-area-([a-z0-9_]+)$/, toExtras: (key) => ({ poi: "area", area: key }) },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The glTF nodes, checked to be objects; only their `name` and `extras` are read. */
function readNodes(gltf: unknown): Record<string, unknown>[] {
  if (!isRecord(gltf) || !Array.isArray(gltf.nodes)) throw new Error("add-poi-extras: no nodes")
  return gltf.nodes.map((node) => {
    if (!isRecord(node)) throw new Error("add-poi-extras: a node is not an object")
    return node
  })
}

function extrasFromLegacyName(name: string): OfficePoiExtras | null {
  for (const rule of LEGACY_NAME_RULES) {
    const match = name.match(rule.pattern)
    if (match) return OfficePoiExtrasSchema.parse(rule.toExtras(match[1]))
  }
  if (name.startsWith("poi-")) throw new Error(`add-poi-extras: no rule for POI node "${name}"`)
  return null
}

/** Splits a GLB into its JSON chunk and the bytes after it, which are kept as they are. */
function splitGlb(file: Buffer): { json: unknown; rest: Buffer } {
  if (file.readUInt32LE(0) !== GLB_MAGIC) throw new Error("add-poi-extras: not a GLB")
  const jsonLength = file.readUInt32LE(GLB_HEADER_BYTES)
  if (file.readUInt32LE(GLB_HEADER_BYTES + 4) !== JSON_CHUNK_TYPE) {
    throw new Error("add-poi-extras: the first GLB chunk is not JSON")
  }
  const jsonStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES
  return {
    json: JSON.parse(file.subarray(jsonStart, jsonStart + jsonLength).toString("utf8")),
    rest: file.subarray(jsonStart + jsonLength),
  }
}

/** Packs a JSON chunk (space-padded to 4 bytes, as the GLB spec requires) back in front of `rest`. */
function joinGlb(json: unknown, rest: Buffer): Buffer {
  const text = JSON.stringify(json)
  const jsonBytes = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, " "), "utf8")
  const header = Buffer.alloc(GLB_HEADER_BYTES + CHUNK_HEADER_BYTES)
  const totalLength = header.length + jsonBytes.length + rest.length
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)
  header.writeUInt32LE(jsonBytes.length, 12)
  header.writeUInt32LE(JSON_CHUNK_TYPE, 16)
  return Buffer.concat([header, jsonBytes, rest])
}

async function main(): Promise<void> {
  const { json, rest } = splitGlb(await readFile(OFFICE_SOURCE))
  let stamped = 0

  for (const node of readNodes(json)) {
    const extras = node.extras ?? {}
    if (!isRecord(extras))
      throw new Error(`add-poi-extras: extras of "${node.name}" are not an object`)
    if (extras.poi !== undefined) {
      OfficePoiExtrasSchema.parse(extras)
      continue
    }
    const poiExtras = typeof node.name === "string" ? extrasFromLegacyName(node.name) : null
    if (!poiExtras) continue
    node.extras = { ...extras, ...poiExtras }
    stamped++
  }

  await writeFile(OFFICE_SOURCE, joinGlb(json, rest))
  console.log(`add-poi-extras: stamped ${stamped} POI nodes in ${path.basename(OFFICE_SOURCE)}`)
}

await main()
