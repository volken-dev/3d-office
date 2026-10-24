import type { SceneManager } from "@the-delegation/scene/scene-manager"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { OFFICE_CAST } from "./data/office-cast"
import { createOfficeSession, type OfficeSession } from "./integration/office-scene"
import { useEscapeToOverview } from "./integration/use-escape-to-overview"
import { AgentPills } from "./interface/agent-pills"

/** Development only: the literal check lets the production build drop the overlay's chunk. */
const PerformanceOverlay =
  process.env.NODE_ENV === "development"
    ? lazy(() => import("./interface/performance-overlay"))
    : null

/** A lost GPU device is recovered by rebuilding the scene, at most this often within the window. */
const MAX_DEVICE_LOSS_RECOVERIES = 3
const DEVICE_LOSS_WINDOW_MS = 60_000

type SceneStatus = "loading" | "ready" | "error"

/** Tracks the scene's ready promise so a missing WebGPU/WebGL2 or a failed model download is visible instead of a blank canvas. */
function useSceneStatus(scene: SceneManager | null): SceneStatus {
  const [settled, setSettled] = useState<{ scene: SceneManager; ok: boolean } | null>(null)
  useEffect(() => {
    if (!scene) return
    let active = true
    scene.ready.then(
      () => {
        if (active) setSettled({ scene, ok: true })
      },
      () => {
        if (active) setSettled({ scene, ok: false })
      },
    )
    return () => {
      active = false
    }
  }, [scene])
  if (!scene || settled?.scene !== scene) return "loading"
  return settled.ok ? "ready" : "error"
}

/**
 * The 3D office, full window, with the agent pills over it once the scene is ready (Tab between
 * them to follow a robot, Esc to return to the overview). A lost GPU device rebuilds the scene through the same effect that
 * creates it, so StrictMode's double mount covers recovery too; past the recovery budget the scene
 * reports itself unavailable. The ref is cleared before disposing, so a dispose that throws on a
 * dead context cannot block the rebuild.
 */
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<OfficeSession | null>(null)
  const [scene, setScene] = useState<SceneManager | null>(null)
  const [sceneGeneration, setSceneGeneration] = useState(0)
  const [isSceneLost, setSceneLost] = useState(false)
  const deviceLossTimesRef = useRef<number[]>([])
  const loadStatus = useSceneStatus(scene)
  const sceneStatus: SceneStatus = isSceneLost ? "error" : loadStatus
  const focusAgent = (agentIndex: number | null) => sessionRef.current?.focusAgent(agentIndex)
  useEscapeToOverview(() => focusAgent(null))

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new sceneGeneration rebuilds the scene after a lost GPU device
  useEffect(() => {
    const onDeviceLost = () => {
      const now = Date.now()
      const recentLosses = deviceLossTimesRef.current.filter(
        (lossTime) => now - lossTime < DEVICE_LOSS_WINDOW_MS,
      )
      recentLosses.push(now)
      deviceLossTimesRef.current = recentLosses
      if (recentLosses.length > MAX_DEVICE_LOSS_RECOVERIES) setSceneLost(true)
      else setSceneGeneration((generation) => generation + 1)
    }
    if (canvasRef.current && !sessionRef.current) {
      const session = createOfficeSession(canvasRef.current, onDeviceLost)
      sessionRef.current = session
      setScene(session.scene)
    }
    return () => {
      const session = sessionRef.current
      if (!session) return
      sessionRef.current = null
      setScene(null)
      session.dispose()
    }
  }, [sceneGeneration])

  return (
    <main ref={canvasRef} className="relative h-dvh w-screen overflow-hidden bg-background">
      {PerformanceOverlay && (
        <Suspense fallback={null}>
          <PerformanceOverlay />
        </Suspense>
      )}
      {sceneStatus === "ready" && (
        <AgentPills agentIndices={OFFICE_CAST.agentIndices} onSelect={focusAgent} />
      )}
      {sceneStatus === "loading" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="animate-pulse text-xs font-bold text-muted-foreground">
            Loading office…
          </span>
        </div>
      )}
      {sceneStatus === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <Alert variant="destructive" className="max-w-md rounded-xl">
            <AlertTitle>The 3D office could not load</AlertTitle>
            <AlertDescription>
              It needs WebGPU or WebGL2 (a recent Chrome, Edge, Safari or Firefox), a working
              graphics driver and a connection to download the models. Reload to try again.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </main>
  )
}
