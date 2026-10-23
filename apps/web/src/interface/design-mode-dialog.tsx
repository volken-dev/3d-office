import { Dialog as DialogPrimitive } from "radix-ui"
import { lazy, Suspense } from "react"
import { DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

/** React Flow is only needed in design mode, so it stays out of the initial bundle. */
const VisualConfigurator = lazy(() =>
  import("./VisualConfigurator/VisualConfigurator").then((module) => ({
    default: module.VisualConfigurator,
  })),
)

function ConfiguratorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="m-4 h-10 w-64" />
      <div className="flex flex-1 gap-4 p-4 pt-0">
        <Skeleton className="w-80" />
        <Skeleton className="flex-1" />
        <Skeleton className="hidden w-96 lg:block" />
      </div>
    </div>
  )
}

function preventDismiss(event: Event) {
  event.preventDefault()
}

/**
 * Full-screen team editor. Rendered as a Radix dialog for focus trapping and so the editor's own portals
 * (tooltips, selects, alert dialogs) stack above it; dismissal is left to the editor, which guards unsaved drafts.
 * Rendering pauses in design mode, so the overlay's blur is computed over a static frame.
 */
export function DesignModeDialog({ open }: { open: boolean }) {
  return (
    <DialogPrimitive.Root open={open}>
      <DialogPortal>
        <DialogOverlay className="bg-background/40 backdrop-blur-xl" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={preventDismiss}
          onInteractOutside={preventDismiss}
          className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-input/50 bg-background shadow-2xl outline-none md:inset-6"
        >
          <DialogTitle className="sr-only">Manage teams</DialogTitle>
          <Suspense fallback={<ConfiguratorSkeleton />}>
            <VisualConfigurator />
          </Suspense>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
