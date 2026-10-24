import * as THREE from "three/webgpu"
import type { TimeOfDayLook } from "./time-of-day"

const SUN_POSITION = new THREE.Vector3(4, 8, 5)
/** Enough for crisp contact shadows over the 21 x 14 m room; the viewer's 4096 costs four times the memory. */
const SHADOW_MAP_SIZE = 2048
/** Half the side of the square the sun's shadow camera covers, a margin around the room. */
const SHADOW_HALF_EXTENT = 15
const SHADOW_NEAR = 0.5
const SHADOW_FAR = 40
const SHADOW_BIAS = -0.0005
const SHADOW_NORMAL_BIAS = 0.03
const SHADOW_CATCHER_SIZE = 60
/** Just under the office plinth (its bottom is at y -0.306), so the catcher never shimmers against it. */
const SHADOW_CATCHER_HEIGHT = -0.32

/**
 * The viewer's lights: a hemisphere fill, a sun casting PCF shadows over the whole room, and a
 * transparent shadow catcher under the office so it sits on the ground. Colours and intensities
 * follow the time of day through `applyLook`.
 */
export class OfficeLighting {
  private readonly hemisphere: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private readonly shadowCatcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>

  constructor(private readonly scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight()
    this.sun = new THREE.DirectionalLight()
    this.sun.position.copy(SUN_POSITION)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    this.sun.shadow.bias = SHADOW_BIAS
    this.sun.shadow.normalBias = SHADOW_NORMAL_BIAS
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -SHADOW_HALF_EXTENT
    shadowCamera.right = SHADOW_HALF_EXTENT
    shadowCamera.top = SHADOW_HALF_EXTENT
    shadowCamera.bottom = -SHADOW_HALF_EXTENT
    shadowCamera.near = SHADOW_NEAR
    shadowCamera.far = SHADOW_FAR
    shadowCamera.updateProjectionMatrix()

    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(SHADOW_CATCHER_SIZE, SHADOW_CATCHER_SIZE),
      new THREE.ShadowMaterial(),
    )
    this.shadowCatcher.rotation.x = -Math.PI / 2
    this.shadowCatcher.position.y = SHADOW_CATCHER_HEIGHT
    this.shadowCatcher.receiveShadow = true

    scene.add(this.hemisphere, this.sun, this.shadowCatcher)
  }

  /** Sets light colours, intensities and the catcher's shadow strength for a time of day. */
  public applyLook(look: TimeOfDayLook): void {
    this.hemisphere.color.set(look.hemisphereSky)
    this.hemisphere.groundColor.set(look.hemisphereGround)
    this.hemisphere.intensity = look.hemisphereIntensity
    this.sun.color.set(look.sunColor)
    this.sun.intensity = look.sunIntensity
    this.shadowCatcher.material.opacity = look.shadowCatcherOpacity
  }

  /** Removes the lights and frees the shadow map and the catcher. */
  public dispose(): void {
    this.scene.remove(this.hemisphere, this.sun, this.shadowCatcher)
    this.sun.dispose()
    this.hemisphere.dispose()
    this.shadowCatcher.geometry.dispose()
    this.shadowCatcher.material.dispose()
  }
}
