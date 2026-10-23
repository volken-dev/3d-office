import { useEffect, useRef, useState } from "react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { removeLegacyApiKey } from "./integration/llm/legacyApiKey"
import { SceneStoreAdapter } from "./integration/SceneStoreAdapter"
import { useCoreStore } from "./integration/store/coreStore"
import { useUiStore } from "./integration/store/uiStore"
import { ActionLogPanel } from "./interface/ActionLogPanel"
import { ReviewRequestToasts } from "./interface/components/ReviewRequestToasts"
import { DESKTOP_QUERY, useMediaQuery } from "./interface/components/useMediaQuery"
import { DesignModeDialog } from "./interface/DesignModeDialog"
import { FinalOutputModal } from "./interface/FinalOutputModal"
import Header, { type HeaderPanelControls } from "./interface/Header"
import InspectorPanel from "./interface/InspectorPanel"
import { KanbanDock } from "./interface/KanbanDock"
import { OutputReviewModal } from "./interface/OutputReviewModal"
import SimulationView from "./interface/SimulationView"
import { SceneContext } from "./simulation/SceneContext"

type DrawerPanel = "logs" | "inspector" | null

/**
 * The app shell. Panel visibility is layout state only, so it lives here rather than in a store.
 * Below lg the side panels live in drawers so the canvas keeps the width. The scene stays mounted
 * in design mode (hidden and paused) so it does not reload on return. Radix dialogs mark the
 * Escape that closes them as handled, so only an unhandled Escape leaves focus mode.
 */
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneStoreAdapter | null>(null)
  const [scene, setScene] = useState<SceneStoreAdapter | null>(null)
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

  useEffect(() => {
    if (canvasRef.current && !sceneRef.current) {
      const connectedScene = new SceneStoreAdapter(canvasRef.current)
      sceneRef.current = connectedScene
      setScene(connectedScene)
    }
    return () => {
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
        setScene(null)
      }
    }
  }, [])

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
