import type * as THREE from "three/webgpu"
import { isMesh, isStandardMaterial, materialsOf } from "../scene-graph-guards"

/** The office node holding the walk grid as geometry, for tools; never drawn in the scene. */
const NAV_MESH_NODE = "navMesh"

/** The plain grey a material glTF left at its fully metallic default is drawn with instead. */
const DEFAULT_MATERIAL_COLOR = 0xc9ced6
const DEFAULT_MATERIAL_ROUGHNESS = 0.8

/**
 * Readies a loaded office for drawing, as the agent-office viewer does: hides `navMesh`, lets
 * opaque meshes cast and every mesh receive shadows (glass and frosted panels cast none), and
 * repairs any material left at glTF's fully metallic default, which renders black without an
 * environment map.
 */
export function prepareOfficeModel(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node.name === NAV_MESH_NODE) node.visible = false
    if (!isMesh(node)) return
    const materials = materialsOf(node)
    node.castShadow = !materials.some((material) => material.transparent)
    node.receiveShadow = true
    for (const material of materials) repairDefaultMaterial(material)
  })
}

function repairDefaultMaterial(material: THREE.Material): void {
  if (!isStandardMaterial(material)) return
  const isGltfDefault =
    material.metalness === 1 &&
    material.roughness === 1 &&
    material.map === null &&
    material.metalnessMap === null
  if (!isGltfDefault) return
  material.metalness = 0
  material.roughness = DEFAULT_MATERIAL_ROUGHNESS
  material.color.set(DEFAULT_MATERIAL_COLOR)
}
