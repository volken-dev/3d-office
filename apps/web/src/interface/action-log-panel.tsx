import { Download, Filter, X } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useCoreStore } from "../integration/store/core-store"
import { useTeamRoster } from "../integration/store/team-store"
import { ActivityList } from "./action-log-activity-list"
import { DebugEntry, type LogAgent } from "./action-log-debug-entry"
import { serializeDebugEntry } from "./action-log-serialize"
import { SCROLL_AREA_BLOCK } from "./components/styles"

const LOG_TABS = [
  { value: "activity", label: "Activity" },
  { value: "technical", label: "Technical" },
] as const

type LogTab = (typeof LOG_TABS)[number]["value"]

function isLogTab(value: string): value is LogTab {
  return LOG_TABS.some((tab) => tab.value === value)
}

/** Within this distance from the top the list follows new entries; further down the reader keeps their place. */
const FOLLOW_THRESHOLD_PX = 40
const ALL_AGENTS = "all"

function newestFirst<T extends { agentIndex: number }>(items: T[], agentIndex: number | null): T[] {
  const filtered =
    agentIndex === null ? items.slice() : items.filter((item) => item.agentIndex === agentIndex)
  return filtered.reverse()
}

function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Side panel with the activity feed and the raw LLM request/response log, filterable by agent. */
export function ActionLogPanel({ className }: { className?: string }) {
  const { setLogFilter, actionLog, debugLog, logFilterAgentIndex } = useCoreStore(
    useShallow((state) => ({
      setLogFilter: state.setLogFilter,
      actionLog: state.actionLog,
      debugLog: state.debugLog,
      logFilterAgentIndex: state.logFilterAgentIndex,
    })),
  )
  const { agents } = useTeamRoster()
  const agentsByIndex = useMemo(
    () =>
      new Map<number, LogAgent>(
        agents.map((agent) => [agent.index, { name: agent.name, color: agent.color }]),
      ),
    [agents],
  )
  const [activeTab, setActiveTab] = useState<LogTab>("activity")
  const scrollRootRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(
    () => newestFirst(actionLog, logFilterAgentIndex),
    [actionLog, logFilterAgentIndex],
  )
  const debugEntries = useMemo(
    () => newestFirst(debugLog, logFilterAgentIndex),
    [debugLog, logFilterAgentIndex],
  )
  const filterAgent =
    logFilterAgentIndex !== null ? agentsByIndex.get(logFilterAgentIndex) : undefined

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run to follow new entries and tab switches, which the effect reads through the DOM
  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    )
    if (!viewport || viewport.scrollTop > FOLLOW_THRESHOLD_PX) return
    const frame = requestAnimationFrame(() => viewport.scrollTo({ top: 0 }))
    return () => cancelAnimationFrame(frame)
  }, [entries, debugEntries, activeTab])

  const handleDownloadAll = () => {
    const content = debugLog
      .map((entry) =>
        serializeDebugEntry(entry, agentsByIndex.get(entry.agentIndex)?.name ?? entry.agentName),
      )
      .join("\n\n\n")
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }))
    const downloadLink = document.createElement("a")
    downloadLink.href = url
    downloadLink.download = `the-delegation-technical-logs-${Date.now()}.txt`
    downloadLink.click()
    URL.revokeObjectURL(url)
  }

  return (
    <aside
      aria-label="Logs"
      className={cn(
        "relative flex h-full w-[320px] shrink-0 flex-col overflow-hidden border-r border-border bg-background",
        className,
      )}
    >
      <div className="z-10 flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xs font-bold text-muted-foreground">Logs</h2>
          {filterAgent && (
            <Badge
              className="gap-1 pr-0.5 text-[11px] font-bold tracking-tight text-white"
              style={{ backgroundColor: filterAgent.color }}
            >
              {filterAgent.name}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setLogFilter(null)}
                aria-label="Clear agent filter"
                className="size-auto rounded-full p-0.5 hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="size-3" aria-hidden />
              </Button>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Filter by agent"
                    className={cn(
                      logFilterAgentIndex !== null &&
                        "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                    )}
                  >
                    <Filter />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Filter by agent</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[11px] font-black text-muted-foreground">
                Show logs from
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={logFilterAgentIndex === null ? ALL_AGENTS : String(logFilterAgentIndex)}
                onValueChange={(value) => setLogFilter(value === ALL_AGENTS ? null : Number(value))}
              >
                <DropdownMenuRadioItem value={ALL_AGENTS} className="text-xs font-bold">
                  All agents
                </DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                {agents.map((agent) => (
                  <DropdownMenuRadioItem
                    key={agent.index}
                    value={String(agent.index)}
                    className="gap-2 text-xs font-bold"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: agent.color }}
                      aria-hidden
                    />
                    {agent.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeTab === "technical" && debugEntries.length > 0 && (
            <IconButton label="Download technical logs (.txt)" onClick={handleDownloadAll}>
              <Download />
            </IconButton>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isLogTab(value)) setActiveTab(value)
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-auto! w-full rounded-none border-b border-border bg-muted/30 p-0"
        >
          {LOG_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none py-2 text-xs font-black after:bottom-0! data-[state=active]:bg-background"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea ref={scrollRootRef} className={cn("min-h-0 flex-1", SCROLL_AREA_BLOCK)}>
          <div className="p-5">
            <TabsContent value="activity">
              <ActivityList entries={entries} agentsByIndex={agentsByIndex} />
            </TabsContent>
            <TabsContent value="technical">
              {debugEntries.length === 0 ? (
                <p className="py-16 text-center text-xs font-bold text-muted-foreground">
                  No technical data...
                </p>
              ) : (
                debugEntries.map((entry) => (
                  <DebugEntry
                    key={entry.id}
                    entry={entry}
                    agent={agentsByIndex.get(entry.agentIndex)}
                  />
                ))
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </aside>
  )
}
