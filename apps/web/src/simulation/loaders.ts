import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { DRACO_LIB_PATH } from "./constants"

export interface SceneLoader {
  load(url: string): Promise<GLTF>
  /** Terminates the Draco worker pool; call once every load has settled. */
  dispose(): void
}

/** One GLTF loader per scene, so all models share a single Draco wasm compile and worker pool. */
export function createSceneLoader(): SceneLoader {
  const draco = new DRACOLoader()
  draco.setDecoderPath(DRACO_LIB_PATH)
  draco.setDecoderConfig({ type: "wasm" })

  const gltf = new GLTFLoader()
  gltf.setDRACOLoader(draco)

  return {
    load: (url) => gltf.loadAsync(url),
    dispose: () => draco.dispose(),
  }
}
