import * as THREE from "three/webgpu"

/** Rendering above this ratio costs a lot of fill rate for little visible gain. */
const MAX_PIXEL_RATIO = 1.5
const MIN_PIXEL_RATIO = 0.75
const PIXEL_RATIO_STEP = 0.25
/** Average frame time over a sample window above which resolution is lowered (~40 fps). */
const SLOW_FRAME_SECONDS = 1 / 40
const SAMPLE_WINDOW_SECONDS = 2
/** Ignore startup (asset loading, shader compilation) when measuring. */
const WARMUP_SECONDS = 3

/** Owns the WebGPU renderer (with WebGL2 fallback), its canvas, the frame timer and adaptive resolution. */
export class Engine {
  public renderer: THREE.WebGPURenderer
  public timer: THREE.Timer

  private pixelRatio: number
  private elapsed = 0
  private sampleTime = 0
  private sampleFrames = 0

  /**
   * The canvas is sized by CSS so it stretches immediately while the drawing buffer catches up on
   * resize. Shadows use the default PCF map: VSM is unreliable with WebGPU node materials.
   */
  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true })
    this.pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(container.clientWidth, container.clientHeight, false)

    this.renderer.domElement.style.width = "100%"
    this.renderer.domElement.style.height = "100%"
    this.renderer.domElement.style.display = "block"

    this.renderer.shadowMap.enabled = true

    container.appendChild(this.renderer.domElement)
    this.timer = new THREE.Timer()
  }

  /** Rejects when neither WebGPU nor the WebGL2 fallback is available. */
  public async init(): Promise<void> {
    await this.renderer.init()
  }

  /**
   * Adaptive resolution: lowers the pixel ratio when the average frame time stays slow,
   * so weaker GPUs trade sharpness for a smooth frame rate. Only ever steps down.
   */
  public trackFrame(deltaSeconds: number) {
    this.elapsed += deltaSeconds
    if (this.elapsed < WARMUP_SECONDS || this.pixelRatio <= MIN_PIXEL_RATIO) return

    this.sampleTime += deltaSeconds
    this.sampleFrames++
    if (this.sampleTime < SAMPLE_WINDOW_SECONDS) return

    const averageFrameSeconds = this.sampleTime / this.sampleFrames
    this.sampleTime = 0
    this.sampleFrames = 0
    if (averageFrameSeconds > SLOW_FRAME_SECONDS) {
      this.pixelRatio = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - PIXEL_RATIO_STEP)
      this.renderer.setPixelRatio(this.pixelRatio)
    }
  }

  public onResize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
  }

  public render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer.render(scene, camera)
  }

  public dispose() {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
