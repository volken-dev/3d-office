import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

export interface SceneLoader {
  /** Loads a model by its path under the asset base URL, e.g. "models/office.glb". */
  load(assetPath: string): Promise<GLTF>
}

/**
 * The scene's GLTF loader. Models are Meshopt-compressed by `bun run assets`; the decoder compiles its
 * small wasm module once, on the main thread, so there is no worker pool to dispose.
 */
export function createSceneLoader(assetBaseUrl: string): SceneLoader {
  const gltf = new GLTFLoader()
  gltf.setMeshoptDecoder(MeshoptDecoder)
  return { load: (assetPath) => gltf.loadAsync(assetUrlFor(assetBaseUrl, assetPath)) }
}

/** Joins the asset base URL (with or without a trailing slash) and a path under it. */
export function assetUrlFor(assetBaseUrl: string, assetPath: string): string {
  return `${assetBaseUrl.replace(/\/+$/, "")}/${assetPath.replace(/^\/+/, "")}`
}
