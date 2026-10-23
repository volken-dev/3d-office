import {
  Expand,
  Info,
  LoaderCircle,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Server,
  ServerOff,
  Settings,
} from "lucide-react"
import type React from "react"
import { useState } from "react"
import { ExternalLink } from "@/components/external-link"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { GatewayStatus } from "../integration/llm/gateway-status"
import { useCoreStore } from "../integration/store/core-store"
import { useUiStore } from "../integration/store/ui-store"
import { BrandLogo, GitHubIcon } from "./components/brand-logo"
import InfoModal from "./info-modal"

const version = process.env.NEXT_PUBLIC_APP_VERSION

const GATEWAY_INDICATOR: Record<
  GatewayStatus,
  { label: string; icon: React.ReactNode; className?: string; dotClassName: string }
> = {
  checking: {
    label: "Model gateway: checking",
    icon: <LoaderCircle className="animate-spin" />,
    dotClassName: "bg-muted-foreground",
  },
  online: {
    label: "Model gateway: online. Click to check again.",
    icon: <Server />,
    className: "text-emerald-600 hover:text-emerald-700",
    dotClassName: "bg-emerald-400",
  },
  not_configured: {
    label: "Model gateway: no Claude key. Click to check again.",
    icon: <ServerOff />,
    className: "text-amber-600 hover:text-amber-700",
    dotClassName: "bg-amber-400",
  },
  unreachable: {
    label: "Model gateway: unreachable. Click to check again.",
    icon: <ServerOff />,
    className: "text-destructive hover:text-destructive/80",
    dotClassName: "bg-destructive",
  },
}

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
 * Top bar: brand, team editor entry, panel toggles and the model gateway status, which re-checks the gateway
 * when clicked.
 */
function Header({ panels }: { panels: HeaderPanelControls }) {
  const gatewayStatus = useUiStore((state) => state.gatewayStatus)
  const checkGateway = useUiStore((state) => state.checkGateway)
  const gateway = GATEWAY_INDICATOR[gatewayStatus]
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
            label={gateway.label}
            onClick={() => void checkGateway()}
            className={cn("relative", gateway.className)}
          >
            {gateway.icon}
            <span
              className={cn("absolute top-1 right-1 size-1.5 rounded-full", gateway.dotClassName)}
              aria-hidden
            />
          </HeaderIconButton>
        </div>
      </div>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
    </header>
  )
}

export default Header
