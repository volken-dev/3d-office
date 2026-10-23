import type { FrameStats } from "@the-delegation/scene/core/frame-profiler"
import { useEffect, useState } from "react"
import { useFrameStats } from "../integration/frame-stats"

const TOGGLE_KEY = "`"

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  )
}

function formatMs(milliseconds: number | null): string {
  return milliseconds === null ? "unavailable" : `${milliseconds.toFixed(1)} ms`
}

function statRows(stats: FrameStats): [string, string][] {
  return [
    ["Frame", `${formatMs(stats.frameAverageMs)} avg, ${formatMs(stats.frameP95Ms)} p95`],
    ["CPU", `${formatMs(stats.cpuAverageMs)} avg`],
    [
      "GPU",
      stats.gpuAverageMs === null
        ? formatMs(null)
        : `${formatMs(stats.gpuAverageMs)} avg, ${formatMs(stats.gpuP95Ms)} p95`,
    ],
    ["Draw calls", stats.drawCalls.toLocaleString()],
    ["Triangles", stats.triangles.toLocaleString()],
    ["Pixel ratio", `${stats.pixelRatio.toFixed(2)} (${stats.bufferWidth}x${stats.bufferHeight})`],
  ]
}

/**
 * Development-only render statistics over the canvas, toggled with the backquote key (ignored
 * while typing). SimulationView only loads this module in development builds.
 */
function PerformanceOverlay() {
  const [isVisible, setVisible] = useState(false)
  const stats = useFrameStats()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== TOGGLE_KEY || event.repeat || isTypingTarget(event.target)) return
      setVisible((visible) => !visible)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (!isVisible) return null

  return (
    <dl
      aria-label="Render performance"
      className="pointer-events-none absolute top-3 left-3 z-20 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md border border-border bg-background/90 px-2.5 py-2 font-mono text-xs tabular-nums select-none"
    >
      {stats ? (
        statRows(stats).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))
      ) : (
        <dt className="col-span-2 text-muted-foreground">Waiting for frames</dt>
      )}
    </dl>
  )
}

export default PerformanceOverlay
