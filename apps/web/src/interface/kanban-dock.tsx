import type React from "react"
import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useCoreStore } from "../integration/store/coreStore"
import { KanbanPanel } from "./KanbanPanel"

const KANBAN_DEFAULT_HEIGHT = 220
const KANBAN_MIN_RATIO = 0.2
const KANBAN_MAX_RATIO = 0.5
const KEYBOARD_STEP_PX = 24

function clampHeight(height: number): number {
  const viewportHeight = window.innerHeight
  return Math.round(
    Math.min(
      viewportHeight * KANBAN_MAX_RATIO,
      Math.max(viewportHeight * KANBAN_MIN_RATIO, height),
    ),
  )
}

/**
 * Kanban drawer under the canvas with its own resize handle. During a drag the height is written straight
 * to the DOM and only committed to state on release, so nothing else re-renders per pointer move.
 */
export function KanbanDock() {
  const [height, setHeight] = useState(KANBAN_DEFAULT_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragHeightRef = useRef(height)
  const setIsResizing = useCoreStore((state) => state.setIsResizing)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragHeightRef.current = height
    setIsDragging(true)
    setIsResizing(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return
    dragHeightRef.current = clampHeight(window.innerHeight - event.clientY)
    containerRef.current.style.height = `${dragHeightRef.current}px`
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setIsDragging(false)
    setIsResizing(false)
    setHeight(dragHeightRef.current)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowUp" ? KEYBOARD_STEP_PX : event.key === "ArrowDown" ? -KEYBOARD_STEP_PX : 0
    if (!delta) return
    event.preventDefault()
    setHeight((currentHeight) => clampHeight(currentHeight + delta))
  }

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable window splitter needs pointer handlers and a grip child, which <hr> cannot host */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize task board"
        aria-valuenow={height}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "group z-30 flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-black/5 transition-colors outline-none hover:bg-input focus-visible:bg-input",
          isDragging && "bg-zinc-300",
        )}
      >
        <div className="h-1 w-12 rounded-full bg-zinc-300 group-hover:bg-zinc-400" />
      </div>
      <div ref={containerRef} className="shrink-0" style={{ height }}>
        <KanbanPanel />
      </div>
    </>
  )
}
