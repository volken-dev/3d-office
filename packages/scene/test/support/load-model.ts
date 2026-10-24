import { readFileSync } from "node:fs"
import path from "node:path"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { type GLTF, GLTFLoader, type GLTFLoaderPlugin } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"

/** The package's shipped assets: the models and the asset contract. */
export const ASSETS_DIR = path.resolve(import.meta.dir, "../../assets")

/** There is no image decoder in bun, so textures load as blanks; the contract is in the nodes. */
const blankTextures: GLTFLoaderPlugin = {
  name: "test_blank_textures",
  loadTexture: () => Promise.resolve(new THREE.Texture()),
}

/** Loads a shipped model by file name, meshopt-decoded, with blank textures. */
export async function loadModel(fileName: string): Promise<GLTF> {
  const file = readFileSync(path.join(ASSETS_DIR, "models", fileName))
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => blankTextures)
  return loader.parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  )
}
