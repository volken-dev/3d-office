import { useSyncExternalStore } from "react"

/** A summary of recent frames, published a few times a second by the dev-only frame profiler. */
export interface FrameStats {
  frameAverageMs: number
  frameP95Ms: number
  cpuAverageMs: number
  /** Null where the device has no timestamp queries, or before the first one resolves. */
  gpuAverageMs: number | null
  gpuP95Ms: number | null
  drawCalls: number
  triangles: number
  pixelRatio: number
  bufferWidth: number
  bufferHeight: number
}

let latest: FrameStats | null = null
const listeners = new Set<() => void>()

/** Replaces the snapshot and notifies subscribers; callers throttle it, never once per frame. */
export function publishFrameStats(stats: FrameStats): void {
  latest = stats
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): FrameStats | null {
  return latest
}

/** The latest frame stats, or null until the scene has rendered long enough to publish. */
export function useFrameStats(): FrameStats | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
