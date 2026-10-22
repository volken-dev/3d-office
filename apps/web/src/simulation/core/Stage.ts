import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import * as THREE from "three/webgpu"
import { SCENE_BACKGROUND_COLOR } from "../constants"

/** The scene, camera, orbit controls and lights, plus the camera's follow and chat-zoom easing. */
export class Stage {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public controls: OrbitControls

  private readonly followTarget = new THREE.Vector3()
  private hasFollowTarget = false
  private readonly lerpTarget = new THREE.Vector3()
  private readonly defaultTarget = new THREE.Vector3(0, 0.8, 0)

  constructor(rendererElement: HTMLElement) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR)

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500)
    this.camera.position.set(10, 8, 15)

    this.controls = new OrbitControls(this.camera, rendererElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.rotateSpeed = 0.8
    this.controls.enableRotate = true
    this.controls.enablePan = false
    this.controls.enableZoom = true
    this.controls.minPolarAngle = Math.PI / 4.5
    this.controls.maxPolarAngle = Math.PI / 2.4
    this.controls.minDistance = 3
    this.controls.maxDistance = 10
    this.controls.target.set(0, 0.8, 0)

    this.controls.addEventListener("start", () => {
      rendererElement.style.cursor = "grabbing"
    })
    this.controls.addEventListener("end", () => {
      rendererElement.style.cursor = "auto"
    })

    this.setupLights()
  }

  /** Ambient stays low so the directional light's shadows keep visible contrast. */
  private setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1 * Math.PI)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI)
    directionalLight.position.set(10, 20, 10)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.near = 0.1
    directionalLight.shadow.camera.far = 100
    directionalLight.shadow.camera.top = 10
    directionalLight.shadow.camera.bottom = -10
    directionalLight.shadow.camera.right = 10
    directionalLight.shadow.camera.left = -10
    directionalLight.shadow.mapSize.set(1024, 1024)
    directionalLight.shadow.bias = -0.0001
    directionalLight.shadow.radius = 2
    directionalLight.shadow.autoUpdate = true
    this.scene.add(directionalLight)
  }

  public onResize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Call every frame with the character's world position to follow, or null to return to origin. The position is copied. */
  public setFollowTarget(position: THREE.Vector3 | null) {
    this.hasFollowTarget = position !== null
    if (position) this.followTarget.copy(position)
  }

  public update() {
    const target = this.hasFollowTarget
      ? this.lerpTarget.set(this.followTarget.x, 0.8, this.followTarget.z)
      : this.defaultTarget
    this.controls.target.lerp(target, 0.06)
    this.controls.update()
  }

  public dispose() {
    this.controls.dispose()
  }

  /**
   * Eases the zoom limits for the chat state. Call every frame.
   * @param playerMoving True while the player walks toward the NPC; controls are locked meanwhile.
   */
  public setChatMode(isChatting: boolean, playerMoving: boolean): void {
    if (isChatting) {
      if (playerMoving) {
        this.controls.enabled = false
        this.controls.minDistance = THREE.MathUtils.lerp(this.controls.minDistance, 4, 0.05)
        this.controls.maxDistance = THREE.MathUtils.lerp(this.controls.maxDistance, 6, 0.05)
      } else {
        this.controls.enabled = true
        this.controls.minDistance = THREE.MathUtils.lerp(this.controls.minDistance, 3, 0.05)
        this.controls.maxDistance = THREE.MathUtils.lerp(this.controls.maxDistance, 10, 0.05)
      }
    } else {
      this.controls.enabled = true
      this.controls.minDistance = THREE.MathUtils.lerp(this.controls.minDistance, 3, 0.05)
      this.controls.maxDistance = THREE.MathUtils.lerp(this.controls.maxDistance, 50, 0.05)
    }
  }
}
