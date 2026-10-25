import { type Document, PropertyType } from "@gltf-transform/core"
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions"
import { MeshoptEncoder } from "meshoptimizer"
import sharp from "sharp"

/** Keyframes a resampled clip may drop while staying within this error of the original. */
const RESAMPLE_TOLERANCE = 1e-4

/** WebP quality for the one texture compressed lossily: the noisy concrete floor. */
const CONCRETE_WEBP_QUALITY = 85

/**
 * Removes a model's clips and records in its scene extras which file to play clips from instead.
 * robot-lite has the robot's joints, node names and face morph targets, so the robot's clips play
 * on it unchanged; shipping them twice would only add bytes.
 */
export function stripClipsInFavourOf(document: Document, clipSourceFile: string): number {
  const root = document.getRoot()
  const animations = root.listAnimations()
  for (const animation of animations) {
    for (const sampler of animation.listSamplers()) sampler.dispose()
    animation.dispose()
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  scene?.setExtras({ ...scene.getExtras(), animationsFrom: clipSourceFile })
  return animations.length
}

/**
 * The shipping compression, applied in place: meshopt geometry, morph targets and animation
 * (`EXT_meshopt_compression` + `KHR_mesh_quantization`), redundant animation keys dropped, and
 * WebP textures (`EXT_texture_webp`). The result is meant to be served gzip or brotli compressed,
 * and loaders need a meshopt decoder.
 * - Only accessors, meshes and textures are deduplicated: materials are matched by name at
 *   runtime (recolouring, `lamp_glow`), so identical ones must not merge.
 * - Pruning keeps empty leaf nodes (they are the POIs), extras, and solid textures:
 *   `status_colors` is uniformly "off" until the scene writes agents' status colours into it.
 * - Lossless WebP beats PNG and lossy WebP on these flat, graphic textures and keeps the
 *   nearest-filtered palette exact; only the concrete floor compresses better lossy.
 * - One quantization volume for the whole file: per-mesh volumes would give each skinned mesh its
 *   own skin.
 */
export async function compressModel(document: Document): Promise<void> {
  await document.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    prune({ keepLeaves: true, keepExtras: true, keepSolidTextures: true }),
    resample({ tolerance: RESAMPLE_TOLERANCE }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      quality: CONCRETE_WEBP_QUALITY,
      pattern: /^concrete$/,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      lossless: true,
      effort: 100,
      pattern: /^(?!concrete$).+/,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "high", quantizationVolume: "scene" }),
  )
}
