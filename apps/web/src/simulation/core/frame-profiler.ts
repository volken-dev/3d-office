import * as THREE from "three/webgpu"
import { publishFrameStats } from "../../integration/frame-stats"

/** About two seconds at 60 fps: long enough for a stable p95, short enough to follow a change. */
const FRAME_SAMPLE_COUNT = 120
/**
 * Timestamps are read back every few frames, not every frame: each readback is an extra submit and
 * buffer map. Every frame still writes its queries, and the pool (2048 queries) holds far more than
 * this many frames' worth.
 */
const TIMESTAMP_RESOLVE_INTERVAL_FRAMES = 15
/** About five seconds of GPU readings at one per resolve. */
const GPU_SAMPLE_COUNT = 20
const PUBLISH_INTERVAL_MS = 250
const TIMESTAMP_QUERY_FEATURE = "timestamp-query"

/** A fixed-size ring of the most recent samples, so recording a frame allocates nothing. */
class SampleWindow {
  private readonly samples: Float64Array
  private nextIndex = 0
  private count = 0

  constructor(private readonly capacity: number) {
    this.samples = new Float64Array(capacity)
  }

  public push(value: number) {
    this.samples[this.nextIndex] = value
    this.nextIndex = (this.nextIndex + 1) % this.capacity
    this.count = Math.min(this.count + 1, this.capacity)
  }

  public isEmpty(): boolean {
    return this.count === 0
  }

  public average(): number {
    let total = 0
    for (let i = 0; i < this.count; i++) total += this.samples[i]
    return this.count === 0 ? 0 : total / this.count
  }

  public percentile95(): number {
    if (this.count === 0) return 0
    const sorted = this.samples.slice(0, this.count).sort()
    return sorted[Math.min(this.count - 1, Math.floor(this.count * 0.95))]
  }
}

/**
 * Development-only frame measurements for the performance overlay: frame interval, the CPU time of
 * one frame's work, GPU time from timestamp queries (where the device has them) and the renderer's
 * draw and triangle counts. Engine only constructs it in development, so production builds carry
 * neither this nor the timestamp queries it reads.
 */
export class FrameProfiler {
  private readonly frameIntervals = new SampleWindow(FRAME_SAMPLE_COUNT)
  private readonly cpuTimes = new SampleWindow(FRAME_SAMPLE_COUNT)
  private readonly gpuTimes = new SampleWindow(GPU_SAMPLE_COUNT)
  private framesSinceResolve = 0
  private frameStartedAt = 0
  private lastFrameEndedAt = 0
  private lastPublishedAt = 0
  private isResolvingTimestamps = false

  /** Call at the start of a frame's work. */
  public beginFrame() {
    this.frameStartedAt = performance.now()
  }

  /** Call once the frame has been submitted to the renderer. */
  public endFrame(renderer: THREE.WebGPURenderer, pixelRatio: number) {
    const now = performance.now()
    if (this.lastFrameEndedAt > 0) this.frameIntervals.push(now - this.lastFrameEndedAt)
    this.lastFrameEndedAt = now
    this.cpuTimes.push(now - this.frameStartedAt)
    this.framesSinceResolve++
    if (this.framesSinceResolve >= TIMESTAMP_RESOLVE_INTERVAL_FRAMES) this.resolveGpuTime(renderer)

    if (now - this.lastPublishedAt < PUBLISH_INTERVAL_MS) return
    this.lastPublishedAt = now
    const hasGpuTime = !this.gpuTimes.isEmpty()
    publishFrameStats({
      frameAverageMs: this.frameIntervals.average(),
      frameP95Ms: this.frameIntervals.percentile95(),
      cpuAverageMs: this.cpuTimes.average(),
      gpuAverageMs: hasGpuTime ? this.gpuTimes.average() : null,
      gpuP95Ms: hasGpuTime ? this.gpuTimes.percentile95() : null,
      drawCalls: renderer.info.render.drawCalls,
      triangles: renderer.info.render.triangles,
      pixelRatio,
      bufferWidth: renderer.domElement.width,
      bufferHeight: renderer.domElement.height,
    })
  }

  /**
   * Reads back the newest frame's render and compute pass durations. One readback at a time; the
   * query pool keeps collecting meanwhile.
   */
  private resolveGpuTime(renderer: THREE.WebGPURenderer) {
    if (this.isResolvingTimestamps || !renderer.hasFeature(TIMESTAMP_QUERY_FEATURE)) return
    this.isResolvingTimestamps = true
    this.framesSinceResolve = 0
    Promise.all([
      renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER),
      renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE),
    ])
      .then(([renderMs, computeMs]) => {
        if (renderMs !== undefined) this.gpuTimes.push(renderMs + (computeMs ?? 0))
      })
      .catch((error: unknown) => {
        console.warn("[FrameProfiler] GPU timestamps could not be read:", error)
      })
      .finally(() => {
        this.isResolvingTimestamps = false
      })
  }
}
