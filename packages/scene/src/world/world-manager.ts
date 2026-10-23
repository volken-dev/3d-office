import type { GLTF } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"
import type { NavMeshManager } from "../pathfinding/nav-mesh-manager"
import { isMesh } from "../scene-graph-guards"
import type { PoiManager } from "./poi-manager"

/** The walkable mesh in the office GLB is the one whose name contains "navmesh", in any case. */
export function isNavMeshName(name: string): boolean {
  return name.toLowerCase().includes("navmesh")
}

/** Loads the office GLB: hides and registers the navmesh, converts materials, and reads the POIs. */
export class WorldManager {
  private office: THREE.Group | null = null
  private navMeshes: THREE.Mesh[] = []
  /** Materials of meshes named "colored*", which take the active team's colour. */
  private themedMaterials: THREE.MeshStandardNodeMaterial[] = []

  constructor(
    private scene: THREE.Scene,
    private navMesh: NavMeshManager,
    private poiManager: PoiManager,
  ) {}

  /**
   * Adds the office to the scene. Every visible material is replaced with a node material, which
   * WebGPU needs for shadows; meshes named "colored*" take the team colour.
   */
  public setup(officeGltf: GLTF, themeColor: string): void {
    this.office = officeGltf.scene
    this.scene.add(this.office)
    const color = new THREE.Color(themeColor)

    this.office.traverse((mesh) => {
      if (!isMesh(mesh)) return
      if (isNavMeshName(mesh.name)) {
        this.navMesh.loadFromGeometry(mesh.geometry)
        mesh.visible = false
        this.navMeshes.push(mesh)
        return
      }

      mesh.receiveShadow = true
      mesh.castShadow = true
      const previousMaterial = mesh.material
      if (!(previousMaterial instanceof THREE.MeshStandardMaterial)) return

      const isThemed = mesh.name.toLowerCase().startsWith("colored")
      const material = new THREE.MeshStandardNodeMaterial({
        color: isThemed ? color : previousMaterial.color,
        map: previousMaterial.map,
        roughness: 1,
        metalness: 0.35,
      })
      previousMaterial.dispose()
      mesh.material = material
      if (isThemed) this.themedMaterials.push(material)
    })

    this.poiManager.loadFromGlb(this.office)
  }

  public updateThemeColor(color: string): void {
    for (const material of this.themedMaterials) material.color.set(color)
  }

  /** Hidden navmesh meshes, for cheap floor raycasts. */
  public getNavMeshes(): THREE.Mesh[] {
    return this.navMeshes
  }

  public dispose(): void {
    this.office?.traverse((mesh) => {
      if (!isMesh(mesh)) return
      mesh.geometry.dispose()
      const material = mesh.material
      if (!Array.isArray(material)) material.dispose()
    })
    this.office = null
    this.navMeshes = []
    this.themedMaterials = []
  }
}
