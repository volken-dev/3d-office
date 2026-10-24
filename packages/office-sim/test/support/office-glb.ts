import { readFileSync } from "node:fs"
import { z } from "zod"
import type { OfficePoi } from "../../src/office-extras"

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK_TYPE = 0x4e4f534a
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

const GltfJsonSchema = z.looseObject({
  scenes: z.array(z.looseObject({ extras: z.unknown().optional() })).min(1),
  accessors: z.array(z.looseObject({ max: z.array(z.number()).optional() })).default([]),
  animations: z
    .array(
      z.looseObject({
        name: z.string(),
        samplers: z.array(z.looseObject({ input: z.number().int().nonnegative() })),
      }),
    )
    .default([]),
  nodes: z.array(
    z.looseObject({
      name: z.string().optional(),
      children: z.array(z.number().int()).optional(),
      translation: z.tuple([z.number(), z.number(), z.number()]).optional(),
      rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    }),
  ),
})

/** Parses the glTF JSON chunk of a GLB file. */
function readGltfJson(path: string): z.infer<typeof GltfJsonSchema> {
  const file = readFileSync(path)
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${path} is not a GLB`)
  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true)
  if (view.getUint32(GLB_HEADER_BYTES + 4, true) !== JSON_CHUNK_TYPE) {
    throw new Error(`${path}: the first chunk is not JSON`)
  }
  const jsonStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES
  const jsonText = new TextDecoder().decode(file.subarray(jsonStart, jsonStart + jsonLength))
  const parsedJson: unknown = JSON.parse(jsonText)
  return GltfJsonSchema.parse(parsedJson)
}

/**
 * Each animation clip's length in seconds, from its samplers' input accessors (glTF requires their
 * `max`), so the movement test times one-shots like the real robot without decoding buffers.
 */
export function readClipDurations(path: string): Map<string, number> {
  const gltf = readGltfJson(path)
  return new Map(
    gltf.animations.map((animation) => [
      animation.name,
      Math.max(
        ...animation.samplers.map((sampler) => gltf.accessors[sampler.input]?.max?.[0] ?? 0),
      ),
    ]),
  )
}

/**
 * Reads an office GLB's scene extras and its `poi-*` nodes straight from the glTF JSON chunk (the
 * JSON is never compressed, only the buffers are), so tests need no glTF loader. POIs must be root
 * nodes, so their local transform is their world transform; yaw comes from the rotation about Y.
 */
export function readOfficeGlb(path: string): { extras: unknown; pois: OfficePoi[] } {
  const gltf = readGltfJson(path)
  const childIndices = new Set(gltf.nodes.flatMap((node) => node.children ?? []))
  const pois: OfficePoi[] = []
  gltf.nodes.forEach((node, nodeIndex) => {
    if (!node.name?.startsWith("poi-")) return
    if (childIndices.has(nodeIndex)) throw new Error(`${node.name} is not a root node`)
    const [x, , z] = node.translation ?? [0, 0, 0]
    const [, rotationY, , rotationW] = node.rotation ?? [0, 0, 0, 1]
    pois.push({ name: node.name, x, z, yaw: 2 * Math.atan2(rotationY, rotationW) })
  })
  return { extras: gltf.scenes[0]?.extras, pois }
}
