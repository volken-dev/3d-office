import { useEffect, useRef } from "react"

/**
 * Per-frame screen positions of characters, written by the render loop.
 *
 * Kept outside React/Zustand on purpose: positions change every frame, and
 * routing them through state would re-render the UI 60 times a second.
 * Overlay elements subscribe and move themselves via `transform` instead.
 */
const positions = new Map<number, { x: number; y: number }>()
const listeners = new Set<() => void>()

/** Mutates the existing entry in place so the per-frame write allocates nothing. */
export function setScreenPosition(index: number, x: number, y: number): void {
  const position = positions.get(index)
  if (position) {
    position.x = x
    position.y = y
  } else positions.set(index, { x, y })
}

/** Forgets every position, so anchors hide until the next frame writes fresh ones. */
export function clearScreenPositions(): void {
  positions.clear()
}

/** Called once per frame after all positions are written. */
export function notifyScreenPositions(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Returns a ref for an absolutely positioned element (left/top 0) that keeps it
 * anchored above the given character without triggering React renders.
 */
export function useAgentAnchor<T extends HTMLElement>(index: number | null) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const update = () => {
      const element = ref.current
      if (!element) return
      const position = index !== null ? positions.get(index) : undefined
      if (!position) {
        element.style.visibility = "hidden"
        return
      }
      element.style.visibility = "visible"
      element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%) translateY(-10px)`
    }
    update()
    return subscribe(update)
  }, [index])
  return ref
}
