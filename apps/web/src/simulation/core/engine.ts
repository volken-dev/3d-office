import * as THREE from "three/webgpu"
import { FrameProfiler, type FrameStats } from "./frame-profiler"

/** Retina-sharp; above 2 the fill-rate cost buys no visible gain. */
const MAX_PIXEL_RATIO = 2
/** Never render below one buffer pixel per CSS pixel: lower than this reads as blurry. */
const MIN_PIXEL_RATIO = 1
const PIXEL_RATIO_STEP = 0.25
/** Average frame time over a sample window above which resolution is lowered (~40 fps). */
const SLOW_FRAME_SECONDS = 1 / 40
/** Average frame time below which resolution is raised again (~55 fps); the gap avoids flapping. */
const FAST_FRAME_SECONDS = 1 / 55
const SAMPLE_WINDOW_SECONDS = 2
/** Ignore startup (asset loading, shader compilation) when measuring. */
const WARMUP_SECONDS = 3

/** Owns the WebGPU renderer (with WebGL2 fallback), its canvas, the frame timer and adaptive resolution. */
export class Engine {
  public renderer: THREE.WebGPURenderer
  public timer: THREE.Timer

  private pixelRatio: number
  private readonly maxPixelRatio: number
  private elapsed = 0
  private sampleTime = 0
  private sampleFrames = 0
  private readonly profiler: FrameProfiler | null

  /**
   * The canvas is sized by CSS so it stretches immediately while the drawing buffer catches up on
   * resize. Shadows use the default PCF map: VSM is unreliable with WebGPU node materials. GPU
   * timestamp queries are only requested in development, for the performance overlay.
   * A lost GPU device (driver reset, GPU switch, sleep) or WebGL context stops the render loop,
   * since nothing can draw on it any more, and is reported so the owner can rebuild the scene.
   * Frame stats are measured only in development and only when the owner listens for them; the
   * literal environment check lets the production build drop the profiler entirely.
   */
  constructor(
    container: HTMLElement,
    onDeviceLost: () => void,
    onFrameStats?: (stats: FrameStats) => void,
  ) {
    this.profiler =
      process.env.NODE_ENV === "development" && onFrameStats
        ? new FrameProfiler(onFrameStats)
        : null
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      trackTimestamp: process.env.NODE_ENV === "development",
    })
    this.renderer.onDeviceLost = (info) => {
      console.error(`[Engine] ${info.api} device lost:`, info.message, info.reason ?? "")
      this.renderer.setAnimationLoop(null)
      onDeviceLost()
    }
    this.maxPixelRatio = Math.max(
      MIN_PIXEL_RATIO,
      Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO),
    )
    this.pixelRatio = this.maxPixelRatio
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

  /** Builds every shader and pipeline the scene needs up front, so the first frames don't stutter. */
  public async compile(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    await this.renderer.compileAsync(scene, camera)
  }

  /**
   * Adaptive resolution: lowers the pixel ratio when the average frame time stays slow, so weaker
   * GPUs trade sharpness for a smooth frame rate, and raises it again once frames are fast, so a
   * passing slow patch (asset loading, a busy agent turn) doesn't leave the scene blurry for good.
   */
  public trackFrame(deltaSeconds: number) {
    this.profiler?.beginFrame()
    this.elapsed += deltaSeconds
    if (this.elapsed < WARMUP_SECONDS) return

    this.sampleTime += deltaSeconds
    this.sampleFrames++
    if (this.sampleTime < SAMPLE_WINDOW_SECONDS) return

    const averageFrameSeconds = this.sampleTime / this.sampleFrames
    this.sampleTime = 0
    this.sampleFrames = 0
    const nextPixelRatio =
      averageFrameSeconds > SLOW_FRAME_SECONDS
        ? Math.max(MIN_PIXEL_RATIO, this.pixelRatio - PIXEL_RATIO_STEP)
        : averageFrameSeconds < FAST_FRAME_SECONDS
          ? Math.min(this.maxPixelRatio, this.pixelRatio + PIXEL_RATIO_STEP)
          : this.pixelRatio
    if (nextPixelRatio === this.pixelRatio) return
    this.pixelRatio = nextPixelRatio
    this.renderer.setPixelRatio(this.pixelRatio)
  }

  public onResize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
  }

  public render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer.render(scene, camera)
    this.profiler?.endFrame(this.renderer, this.pixelRatio)
  }

  public dispose() {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
