import * as THREE from "three/webgpu"
import { isLight, isMesh, isSkinnedMesh, materialsOf } from "./scene-graph-guards"

/**
 * Frees the GPU side of everything under `root`: geometries, materials, every texture a material
 * holds, skeletons and lights. Shared resources may be reached twice; three's `dispose` is safe to
 * repeat. Detaches `root` from its parent, so a disposed tree is never drawn again.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (isSkinnedMesh(node)) node.skeleton.dispose()
    if (isLight(node)) node.dispose()
    if (!isMesh(node)) return
    node.geometry.dispose()
    for (const material of materialsOf(node)) disposeMaterial(material)
  })
  root.removeFromParent()
}

/** Disposes a material and the textures it references. */
export function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}
