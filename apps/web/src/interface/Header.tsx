import { Expand, Info, KeyRound, PanelBottom, PanelLeft, PanelRight, Settings } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { ExternalLink } from "@/components/ExternalLink"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useCoreStore } from "../integration/store/coreStore"
import { useUiStore } from "../integration/store/uiStore"
import BYOKModal from "./BYOKModal"
import { BrandLogo, GitHubIcon } from "./components/BrandLogo"
import InfoModal from "./InfoModal"

const version = process.env.NEXT_PUBLIC_APP_VERSION

function HeaderIconButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function toggleBrowserFullscreen() {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.()
  else void document.exitFullscreen?.()
}

/** Panel toggles the layout hands to the header, since the header owns the buttons but not the panels. */
export interface HeaderPanelControls {
  logsOpen: boolean
  onToggleLogs: () => void
  tasksOpen: boolean
  onToggleTasks: () => void
  /** Only provided on narrow screens, where the inspector lives in a drawer. */
  onOpenInspector?: () => void
}

/**
 * Top bar: brand, team editor entry, panel toggles and the API key button. The key dialog is
 * mounted only while open so its form re-reads the saved key each time.
 */
function Header({ panels }: { panels: HeaderPanelControls }) {
  const { hasKey, isBYOKOpen, setBYOKOpen } = useUiStore(
    useShallow((state) => ({
      hasKey: !!state.llmConfig.apiKey,
      isBYOKOpen: state.isBYOKOpen,
      setBYOKOpen: state.setBYOKOpen,
    })),
  )
  const setViewMode = useCoreStore((state) => state.setViewMode)
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-6">
      <div className="flex min-w-0 items-center">
        <BrandLogo />
        <div className="mt-3 ml-2 flex min-w-0 items-center gap-3 self-start">
          <div className="flex shrink-0 items-center gap-1">
            <HeaderIconButton
              label="About The Delegation"
              onClick={() => setIsInfoOpen(true)}
              className="size-6"
            >
              <Info className="size-3.5" />
            </HeaderIconButton>
            <span className="font-mono text-[11px] font-medium text-muted-foreground">
              v{version}
            </span>
          </div>
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <ExternalLink
              href="https://x.com/arturitu"
              className="truncate text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              @arturitu
            </ExternalLink>
            <ExternalLink
              href="https://github.com/arturitu/the-delegation"
              aria-label="View on GitHub"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <GitHubIcon />
            </ExternalLink>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <Button
          size="cta"
          onClick={() => setViewMode("design")}
          aria-label="Manage teams"
          className="px-3 text-[11px] shadow-lg shadow-black/10"
        >
          <Settings className="size-3.5" />
          <span className="hidden sm:inline">Manage teams</span>
        </Button>

        <div className="mx-1 h-4 w-px bg-input" aria-hidden />

        <div className="flex items-center gap-0.5">
          <HeaderIconButton
            label={panels.logsOpen ? "Hide logs" : "Show logs"}
            aria-pressed={panels.logsOpen}
            onClick={panels.onToggleLogs}
          >
            <PanelLeft />
          </HeaderIconButton>
          <HeaderIconButton
            label={panels.tasksOpen ? "Hide tasks" : "Show tasks"}
            aria-pressed={panels.tasksOpen}
            onClick={panels.onToggleTasks}
          >
            <PanelBottom />
          </HeaderIconButton>
          {panels.onOpenInspector && (
            <HeaderIconButton
              label="Show project and agent details"
              onClick={panels.onOpenInspector}
            >
              <PanelRight />
            </HeaderIconButton>
          )}
          <HeaderIconButton
            label="Browser fullscreen"
            onClick={toggleBrowserFullscreen}
            className="hidden sm:inline-flex"
          >
            <Expand />
          </HeaderIconButton>
          <HeaderIconButton
            label={hasKey ? "API key (saved)" : "API key (not set)"}
            onClick={() => setBYOKOpen(true)}
            className={cn("relative", hasKey && "text-emerald-500 hover:text-emerald-600")}
          >
            <KeyRound />
            {hasKey && (
              <span
                className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-400"
                aria-hidden
              />
            )}
          </HeaderIconButton>
        </div>
      </div>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
      {isBYOKOpen && <BYOKModal onClose={() => setBYOKOpen(false)} />}
    </header>
  )
}

export default Header
