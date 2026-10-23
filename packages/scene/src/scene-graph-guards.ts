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
