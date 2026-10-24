import type * as THREE from "three/webgpu"

/**
 * Narrows a scene-graph node to a mesh by three's own `isMesh` flag, the check three itself uses
 * when traversing loaded GLTF scenes.
 */
export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return "isMesh" in object && object.isMesh === true
}

/** Narrows a scene-graph node to a skinned mesh by three's own `isSkinnedMesh` flag. */
export function isSkinnedMesh(object: THREE.Object3D): object is THREE.SkinnedMesh {
  return "isSkinnedMesh" in object && object.isSkinnedMesh === true
}

/** Narrows a scene-graph node to a light (the office's KHR_lights_punctual lamps). */
export function isLight(object: THREE.Object3D): object is THREE.Light {
  return "isLight" in object && object.isLight === true
}

/**
 * Narrows a material to the standard PBR material GLTFLoader creates, the one with colour,
 * emissive intensity and metalness to adjust.
 */
export function isStandardMaterial(
  material: THREE.Material,
): material is THREE.MeshStandardMaterial {
  return "isMeshStandardMaterial" in material && material.isMeshStandardMaterial === true
}

/** A mesh's materials as a list, whether it has one material or one per geometry group. */
export function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}
