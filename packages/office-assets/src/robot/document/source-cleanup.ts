import type { Root } from "@gltf-transform/core"

/** The source character's mesh nodes, replaced by the robot. */
const SOURCE_MESH_NODES = ["body", "cap", "headphones", "eyes", "mouth"]

/**
 * Removes the source character's meshes, materials, texture atlases and extensions, keeping its
 * skeleton, skin and clips.
 */
export function removeSourceCharacter(root: Root): void {
  for (const node of root.listNodes()) {
    if (SOURCE_MESH_NODES.includes(node.getName())) {
      node.getMesh()?.dispose()
      node.dispose()
    }
  }
  for (const material of root.listMaterials()) material.dispose()
  for (const texture of root.listTextures()) texture.dispose()
  for (const extension of root.listExtensionsUsed()) extension.dispose()
}
