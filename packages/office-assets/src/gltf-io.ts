import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import draco3d from "draco3dgltf"
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer"

/**
 * A glTF-Transform reader and writer that understands every extension the shipped models use
 * (meshopt, quantization, WebP, punctual lights) and can decode Draco, for reading raw, compressed
 * and source-rig files alike.
 */
export async function createModelIo(): Promise<NodeIO> {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  })
}
