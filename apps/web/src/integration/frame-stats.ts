import type { FrameStats } from "@the-delegation/scene/core/frame-profiler"
import { useSyncExternalStore } from "react"

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
