import { NodeIO } from "@gltf-transform/core"
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions"
import draco3d from "draco3dgltf"

/**
 * A glTF reader and writer with the Khronos extensions and the Draco codecs, so it can read the
 * source rig whatever it was compressed with.
 */
export async function createRobotIo(): Promise<NodeIO> {
  return new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  })
}
