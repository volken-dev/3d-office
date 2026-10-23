import { useEffect, useRef, useState } from "react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { removeLegacyApiKey } from "./integration/llm/legacy-api-key"
import { SceneStoreAdapter } from "./integration/scene-store-adapter"
import { useCoreStore } from "./integration/store/core-store"
import { useUiStore } from "./integration/store/ui-store"
import { ActionLogPanel } from "./interface/action-log-panel"
import { ReviewRequestToasts } from "./interface/components/review-request-toasts"
import { DESKTOP_QUERY, useMediaQuery } from "./interface/components/use-media-query"
import { DesignModeDialog } from "./interface/design-mode-dialog"
import { FinalOutputModal } from "./interface/final-output-modal"
import Header, { type HeaderPanelControls } from "./interface/header"
import InspectorPanel from "./interface/inspector-panel"
import { KanbanDock } from "./interface/kanban-dock"
import { OutputReviewModal } from "./interface/output-review-modal"
import SimulationView from "./interface/simulation-view"
import { SceneContext } from "./simulation/scene-context"

type DrawerPanel = "logs" | "inspector" | null

/** A lost GPU device is recovered by rebuilding the scene, at most this often within the window. */
const MAX_DEVICE_LOSS_RECOVERIES = 3
const DEVICE_LOSS_WINDOW_MS = 60_000

/**
 * The app shell. Panel visibility is layout state only, so it lives here rather than in a store.
 * Below lg the side panels live in drawers so the canvas keeps the width. The scene stays mounted
 * in design mode (hidden and paused) so it does not reload on return. Radix dialogs mark the
 * Escape that closes them as handled, so only an unhandled Escape leaves focus mode. A lost GPU
 * device rebuilds the scene through the same effect that creates it, so StrictMode's double mount
 * covers recovery too; past the recovery budget the scene reports itself unavailable. The ref is
 * cleared before disposing, so a dispose that throws on a dead context cannot block the rebuild.
 */
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneStoreAdapter | null>(null)
  const [scene, setScene] = useState<SceneStoreAdapter | null>(null)
  const [sceneGeneration, setSceneGeneration] = useState(0)
  const [isSceneLost, setSceneLost] = useState(false)
  const deviceLossTimesRef = useRef<number[]>([])
  const viewMode = useCoreStore((state) => state.viewMode)
  const [isLogOpen, setLogOpen] = useState(true)
  const [isKanbanOpen, setKanbanOpen] = useState(true)
  const [isFocusMode, setFocusMode] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [drawer, setDrawer] = useState<DrawerPanel>(null)
  const isDesign = viewMode === "design"

  useEffect(() => {
    removeLegacyApiKey()
    void useUiStore.getState().checkGateway()
  }, [])

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
      const connectedScene = new SceneStoreAdapter(canvasRef.current, onDeviceLost)
      sceneRef.current = connectedScene
      setScene(connectedScene)
    }
    return () => {
      const connectedScene = sceneRef.current
      if (!connectedScene) return
      sceneRef.current = null
      setScene(null)
      connectedScene.dispose()
    }
  }, [sceneGeneration])

  useEffect(() => {
    if (!isFocusMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      const isUnhandledEscape = event.key === "Escape" && !event.defaultPrevented
      if (isUnhandledEscape) setFocusMode(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isFocusMode])

  useEffect(() => {
    if (isDesktop) return
    return useUiStore.subscribe((state, previousState) => {
      if (
        state.selectedNpcIndex !== null &&
        state.selectedNpcIndex !== previousState.selectedNpcIndex
      )
        setDrawer("inspector")
    })
  }, [isDesktop])

  const panels: HeaderPanelControls = isDesktop
    ? {
        logsOpen: isLogOpen,
        onToggleLogs: () => setLogOpen(!isLogOpen),
        tasksOpen: isKanbanOpen,
        onToggleTasks: () => setKanbanOpen(!isKanbanOpen),
      }
    : {
        logsOpen: drawer === "logs",
        onToggleLogs: () => setDrawer(drawer === "logs" ? null : "logs"),
        tasksOpen: isKanbanOpen,
        onToggleTasks: () => setKanbanOpen(!isKanbanOpen),
        onOpenInspector: () => setDrawer("inspector"),
      }

  const showChrome = !isFocusMode && !isDesign

  return (
    <SceneContext.Provider value={scene}>
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background">
        {!isFocusMode && <Header panels={panels} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          {showChrome && isDesktop && isLogOpen && <ActionLogPanel />}

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50">
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              style={{ visibility: isDesign ? "hidden" : "visible" }}
            >
              <SimulationView
                canvasRef={canvasRef}
                isSceneLost={isSceneLost}
                isFocusMode={isFocusMode}
                onFocusModeChange={setFocusMode}
              />
              {isKanbanOpen && !isFocusMode && <KanbanDock />}
            </div>
          </main>

          {showChrome && isDesktop && <InspectorPanel />}
        </div>

        {!isDesktop && (
          <Sheet
            open={showChrome && drawer !== null}
            onOpenChange={(open) => !open && setDrawer(null)}
          >
            <SheetContent
              side={drawer === "logs" ? "left" : "right"}
              className="w-80 gap-0 p-0 pt-12 sm:max-w-80"
              aria-describedby={undefined}
            >
              <SheetTitle className="sr-only">
                {drawer === "logs" ? "Logs" : "Project and agent details"}
              </SheetTitle>
              {drawer === "logs" ? (
                <ActionLogPanel className="w-full border-r-0" />
              ) : (
                <InspectorPanel className="w-full border-l-0" />
              )}
            </SheetContent>
          </Sheet>
        )}

        <DesignModeDialog open={isDesign} />
        <FinalOutputModal />
        <OutputReviewModal />
        <ReviewRequestToasts />
      </div>
    </SceneContext.Provider>
  )
}
