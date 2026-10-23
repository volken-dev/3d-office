import React from "react"
import { formatTime } from "@/lib/format"
import type { ActionLogEntry } from "../integration/store/core-store"
import type { LogAgent } from "./action-log-debug-entry"

const ActivityItem = React.memo(function ActivityItem({
  entry,
  agent,
}: {
  entry: ActionLogEntry
  agent: LogAgent | undefined
}) {
  return (
    <li className="group flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="size-1.5 rounded-full shadow-sm"
            style={{ backgroundColor: agent?.color ?? "var(--input)" }}
            aria-hidden
          />
          <span className="text-[11px] leading-none font-black text-foreground">
            {agent?.name ?? "System"}
          </span>
        </div>
        <time
          dateTime={new Date(entry.timestamp).toISOString()}
          className="font-mono text-[11px] text-muted-foreground"
        >
          {formatTime(entry.timestamp)}
        </time>
      </div>
      <p className="border-l border-border pl-3.5 text-xs leading-relaxed font-medium text-foreground/80 transition-colors group-hover:border-input">
        {entry.action}
      </p>
    </li>
  )
})

interface ActivityListProps {
  entries: ActionLogEntry[]
  agentsByIndex: Map<number, LogAgent>
}

/** Newest-first feed of what each agent did, one line per action. */
export function ActivityList({ entries, agentsByIndex }: ActivityListProps) {
  if (entries.length === 0) {
    return (
      <p className="py-16 text-center text-xs font-bold text-muted-foreground">
        Awaiting actions...
      </p>
    )
  }
  return (
    <ul className="space-y-4">
      {entries.map((entry) => (
        <ActivityItem key={entry.id} entry={entry} agent={agentsByIndex.get(entry.agentIndex)} />
      ))}
    </ul>
  )
}
