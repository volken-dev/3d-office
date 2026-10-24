import type { SceneManager } from "@the-delegation/scene/scene-manager"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { createOfficeScene } from "./integration/office-scene"

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
 * The 3D office, full window. A lost GPU device rebuilds the scene through the same effect that
 * creates it, so StrictMode's double mount covers recovery too; past the recovery budget the scene
 * reports itself unavailable. The ref is cleared before disposing, so a dispose that throws on a
 * dead context cannot block the rebuild.
 */
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneManager | null>(null)
  const [scene, setScene] = useState<SceneManager | null>(null)
  const [sceneGeneration, setSceneGeneration] = useState(0)
  const [isSceneLost, setSceneLost] = useState(false)
  const deviceLossTimesRef = useRef<number[]>([])
  const loadStatus = useSceneStatus(scene)
  const sceneStatus: SceneStatus = isSceneLost ? "error" : loadStatus

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
    if (canvasRef.current && !sceneRef.current) {
      const createdScene = createOfficeScene(canvasRef.current, onDeviceLost)
      sceneRef.current = createdScene
      setScene(createdScene)
    }
    return () => {
      const createdScene = sceneRef.current
      if (!createdScene) return
      sceneRef.current = null
      setScene(null)
      createdScene.dispose()
    }
  }, [sceneGeneration])

  return (
    <main ref={canvasRef} className="relative h-dvh w-screen overflow-hidden bg-background">
      {PerformanceOverlay && (
        <Suspense fallback={null}>
          <PerformanceOverlay />
        </Suspense>
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
