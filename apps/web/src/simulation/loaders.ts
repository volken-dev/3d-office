import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

export interface SceneLoader {
  load(url: string): Promise<GLTF>
}

/**
 * The scene's GLTF loader. Models are Meshopt-compressed by `bun run assets`; the decoder compiles its
 * small wasm module once, on the main thread, so there is no worker pool to dispose.
 */
export function createSceneLoader(): SceneLoader {
  const gltf = new GLTFLoader()
  gltf.setMeshoptDecoder(MeshoptDecoder)
  return { load: (url) => gltf.loadAsync(url) }
}
