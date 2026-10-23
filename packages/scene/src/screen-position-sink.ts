/**
 * Where the render loop writes each character's on-screen anchor (the name and chat bubble
 * position). Called every frame, so implementations must not allocate.
 */
export interface ScreenPositionSink {
  set(agentIndex: number, x: number, y: number): void
  /** Forgets every position, so anchors hide until the next frame writes fresh ones. */
  clear(): void
  /** Called once per frame after all positions are written. */
  notify(): void
}
