import { useEffect, useRef } from 'react';

/**
 * Per-frame screen positions of characters, written by the render loop.
 *
 * Kept outside React/Zustand on purpose: positions change every frame, and
 * routing them through state would re-render the UI 60 times a second.
 * Overlay elements subscribe and move themselves via `transform` instead.
 */
const positions = new Map<number, { x: number; y: number }>();
const listeners = new Set<() => void>();

export function setScreenPosition(index: number, x: number, y: number) {
  const p = positions.get(index);
  if (p) { p.x = x; p.y = y; }
  else positions.set(index, { x, y });
}

export function getScreenPosition(index: number): { x: number; y: number } | undefined {
  return positions.get(index);
}

export function clearScreenPositions() {
  positions.clear();
}

/** Called once per frame after all positions are written. */
export function notifyScreenPositions() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Returns a ref for an absolutely positioned element (left/top 0) that keeps it
 * anchored above the given character without triggering React renders.
 */
export function useAgentAnchor<T extends HTMLElement>(index: number | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const p = index !== null ? positions.get(index) : undefined;
      if (!p) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%) translateY(-10px)`;
    };
    update();
    return subscribe(update);
  }, [index]);
  return ref;
}
