import { Eye, Focus, Minimize2, MonitorX } from "lucide-react"
import type React from "react"
import { lazy, Suspense, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SceneStoreAdapter } from "../integration/scene-store-adapter"
import { useActiveTeam } from "../integration/store/team-store"
import { useUiStore } from "../integration/store/ui-store"
import { useScene } from "../simulation/scene-context"
import { AuditModal } from "./audit-modal"
import { TeamBadge } from "./components/team-badge"
import { TeamOutputBadge } from "./components/team-output-badge"
import InspectorPanel from "./inspector-panel"
import UIOverlay from "./ui-overlay"

const TeamFlowModal = lazy(() => import("./team-flow-modal"))
/** Development only: the literal check lets the production build drop the overlay's chunk. */
const PerformanceOverlay =
  process.env.NODE_ENV === "development" ? lazy(() => import("./performance-overlay")) : null

type SceneStatus = "loading" | "ready" | "error"

/** Tracks the scene's ready promise so a missing WebGPU/WebGL2 or a failed model download is visible instead of a blank canvas. */
function useSceneStatus(scene: SceneStoreAdapter | null): SceneStatus {
  const [settled, setSettled] = useState<{ scene: SceneStoreAdapter; ok: boolean } | null>(null)
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

interface SimulationViewProps {
  canvasRef: React.RefObject<HTMLDivElement | null>
  /** The GPU device kept being lost and the scene is no longer rebuilt. */
  isSceneLost: boolean
  isFocusMode: boolean
  onFocusModeChange: (value: boolean) => void
}

/** The canvas column: team bar, the 3D view with its overlays and load states, and the task review dialog. */
function SimulationView({
  canvasRef,
  isSceneLost,
  isFocusMode,
  onFocusModeChange,
}: SimulationViewProps) {
  const selectedNpcIndex = useUiStore((state) => state.selectedNpcIndex)
  const activeAuditTaskId = useUiStore((state) => state.activeAuditTaskId)
  const setActiveAuditTaskId = useUiStore((state) => state.setActiveAuditTaskId)
  const activeTeam = useActiveTeam()
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false)
  const loadStatus = useSceneStatus(useScene())
  const sceneStatus: SceneStatus = isSceneLost ? "error" : loadStatus
  const focusLabel = isFocusMode ? "Exit focus (Esc)" : "Focus 3D view"

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-background px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Button
            variant="bare"
            size="bare"
            onClick={() => setIsFlowModalOpen(true)}
            aria-label={`View team flow for ${activeTeam.teamName}`}
            className="group gap-4 rounded-2xl px-2.5 py-1.5 hover:bg-muted/50 focus-visible:ring-2 active:scale-95"
          >
            <TeamBadge system={activeTeam} />
            <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-input group-hover:text-foreground">
              <Eye className="size-3.5" aria-hidden />
            </span>
          </Button>
          <TeamOutputBadge system={activeTeam} className="hidden md:flex" />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onFocusModeChange(!isFocusMode)}
              aria-label={focusLabel}
              aria-pressed={isFocusMode}
              className="text-muted-foreground hover:text-foreground"
            >
              {isFocusMode ? <Minimize2 /> : <Focus />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{focusLabel}</TooltipContent>
        </Tooltip>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden bg-black/5">
        <UIOverlay />
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
              <MonitorX />
              <AlertTitle>The 3D office could not load</AlertTitle>
              <AlertDescription>
                It needs WebGPU or WebGL2 (a recent Chrome, Edge, Safari or Firefox), a working
                graphics driver and a connection to download the models. The panels and agents still
                work; reload to try again.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {isFocusMode && selectedNpcIndex !== null && (
          <div className="pointer-events-none absolute top-4 right-4 bottom-4 z-30 flex w-96 max-w-[calc(100%-2rem)] flex-col gap-4">
            <InspectorPanel isFloating />
          </div>
        )}
      </div>

      {isFlowModalOpen && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              role="status"
              aria-label="Loading team flow"
            >
              <Skeleton className="h-[70dvh] w-[min(64rem,calc(100vw-2rem))] rounded-3xl bg-background/80" />
            </div>
          }
        >
          <TeamFlowModal isOpen onClose={() => setIsFlowModalOpen(false)} system={activeTeam} />
        </Suspense>
      )}

      {activeAuditTaskId && (
        <AuditModal
          key={activeAuditTaskId}
          isOpen
          taskId={activeAuditTaskId}
          onClose={() => setActiveAuditTaskId(null)}
        />
      )}
    </div>
  )
}

export default SimulationView
