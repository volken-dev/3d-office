import { blockText, toolCallsIn } from "@the-delegation/agents/agent/history"
import type { ContentBlock } from "@the-delegation/shared/llm-messages"
import { ChevronRight, Download, MessageSquare, Terminal, Zap } from "lucide-react"
import React from "react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatTime, formatTokens } from "@/lib/format"
import { totalTokensOf } from "@/lib/usage"
import { cn } from "@/lib/utils"
import type {
  DebugLogEntry,
  RequestDebugLogEntry,
  ResponseDebugLogEntry,
} from "../integration/store/core-store"
import { serializeDebugEntry } from "./action-log-serialize"
import { ToolCallCard } from "./action-log-tool-call-card"
import { CopyButton } from "./components/copy-button"

/** The roster fields a log row needs to label and colour an agent. */
export interface LogAgent {
  name: string
  color: string
}

const COPY_REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"

interface DebugSectionProps {
  title: string
  icon: React.ReactNode
  copyLabel: string
  getCopyText?: () => string
  defaultOpen?: boolean
  disabled?: boolean
  /** Only mounted while open, so expensive children (raw JSON) cost nothing when collapsed. */
  children: React.ReactNode
}

function DebugSection({
  title,
  icon,
  copyLabel,
  getCopyText,
  defaultOpen,
  disabled,
  children,
}: DebugSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} disabled={disabled} className="group/section">
      <div className="flex items-center justify-between gap-1.5">
        <CollapsibleTrigger className="flex items-center gap-1.5 rounded py-1 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50">
          <ChevronRight
            size={12}
            className={cn(
              "transition-transform group-data-[state=open]/section:rotate-90",
              disabled && "invisible",
            )}
            aria-hidden
          />
          {icon}
          <span className="text-[11px] font-bold">{title}</span>
        </CollapsibleTrigger>
        {getCopyText && !disabled && <CopyButton getText={getCopyText} label={copyLabel} />}
      </div>
      <CollapsibleContent className="mt-1.5">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded border border-primary bg-primary p-2 font-mono text-[11px] leading-relaxed whitespace-pre text-zinc-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function RequestDetails({ entry }: { entry: RequestDebugLogEntry }) {
  const tools = entry.systemTools ?? []
  const contents = entry.contents ?? []

  return (
    <>
      {entry.systemInstruction && (
        <DebugSection
          title="System instruction"
          icon={<Terminal size={12} aria-hidden />}
          copyLabel="System instruction"
          getCopyText={() => entry.systemInstruction ?? ""}
        >
          <pre className="rounded border border-border bg-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/80">
            {entry.systemInstruction}
          </pre>
        </DebugSection>
      )}

      <DebugSection
        title={`System tools (${tools.length})`}
        icon={<Zap size={12} aria-hidden />}
        copyLabel="System tools"
        getCopyText={() => JSON.stringify(tools, null, 2)}
        disabled={tools.length === 0}
      >
        <div className="flex flex-wrap gap-1 rounded border border-emerald-100/40 bg-emerald-50/30 p-2">
          {tools.map((tool) => (
            <span
              key={tool.name}
              className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700"
            >
              {tool.name}
            </span>
          ))}
        </div>
      </DebugSection>

      {contents.length > 0 && (
        <DebugSection
          title={`Messages (${contents.length})`}
          icon={<MessageSquare size={12} aria-hidden />}
          copyLabel="Messages"
          getCopyText={() => JSON.stringify(contents, null, 2)}
          defaultOpen
        >
          <div className="max-h-80 space-y-2 overflow-y-auto border-l-2 border-border pr-1 pl-2">
            {contents.map((message, messageIndex) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a logged request never changes, so a message's position is its identity
                key={messageIndex}
                className={cn(
                  "rounded border p-2",
                  message.role === "user"
                    ? "border-border bg-background"
                    : "border-emerald-100/50 bg-emerald-50/30",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-black capitalize",
                    message.role === "user" ? "text-muted-foreground" : "text-emerald-700",
                  )}
                >
                  {message.role}
                </span>
                <MessageBlocks content={message.content} />
              </div>
            ))}
          </div>
        </DebugSection>
      )}
    </>
  )
}

/** A logged message's blocks: text, tool calls, tool results and a marker for opaque reasoning. */
function MessageBlocks({ content }: { content: readonly ContentBlock[] }) {
  return (
    <div className="mt-1 space-y-2">
      {content.map((block, blockIndex) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: a logged message never changes, so a block's position is its identity
        const key = blockIndex
        if (block.type === "text") {
          return (
            <p
              key={key}
              className="py-1 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80"
            >
              {block.text}
            </p>
          )
        }
        if (block.type === "tool_call") return <ToolCallCard key={key} call={block} />
        if (block.type === "tool_result") {
          return (
            <div
              key={key}
              className={cn(
                "rounded border p-2 text-[11px] whitespace-pre-wrap",
                block.isError
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-border bg-muted/40 text-foreground/80",
              )}
            >
              <span className="font-bold">{block.isError ? "Tool error" : "Tool result"}: </span>
              {block.content}
            </div>
          )
        }
        return (
          <span
            key={key}
            className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {block.provider} reasoning (not shown)
          </span>
        )
      })}
    </div>
  )
}

function ResponseDetails({ entry }: { entry: ResponseDebugLogEntry }) {
  const text = blockText(entry.content)
  const toolCalls = toolCallsIn(entry.content)
  return (
    <>
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-1.5 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MessageSquare size={12} aria-hidden />
            <span className="text-[11px] font-bold">Response details</span>
          </div>
          {text && <CopyButton getText={() => text} label="Response" />}
        </div>
        {text && (
          <div className="relative rounded border border-border bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80 italic shadow-sm">
            <span className="absolute -top-2 left-2 rounded border border-border bg-background px-1 text-[11px] font-black text-muted-foreground not-italic">
              Text
            </span>
            {text}
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="space-y-2">
            <div className="ml-1 flex items-center gap-1.5 text-emerald-700">
              <Zap size={12} aria-hidden />
              <span className="text-[11px] font-black">Tool calls</span>
            </div>
            {toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} call={toolCall} />
            ))}
          </div>
        )}
      </div>

      {entry.raw != null && (
        <DebugSection
          title="Response summary"
          icon={<Download size={12} aria-hidden />}
          copyLabel="Raw response"
          getCopyText={() => JSON.stringify(entry.raw, null, 2)}
        >
          <RawJson value={entry.raw} />
        </DebugSection>
      )}
    </>
  )
}

interface DebugEntryProps {
  entry: DebugLogEntry
  agent: LogAgent | undefined
}

/** One technical log entry: a collapsed summary row that expands into the request or response details. */
export const DebugEntry = React.memo(function DebugEntry({ entry, agent }: DebugEntryProps) {
  const agentName = agent?.name ?? entry.agentName
  const isRequest = entry.phase === "request"

  return (
    <Collapsible className="group/entry border-b border-border py-3 last:border-0">
      <div className="group mb-1 flex items-start gap-1 pr-1">
        <CollapsibleTrigger className="flex flex-1 flex-col gap-1.5 rounded p-1 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50">
          <div className="flex w-full items-start justify-between gap-2 overflow-hidden">
            <div className="flex flex-col gap-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: agent?.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate text-[11px] leading-none font-black text-foreground">
                  {agentName}
                </span>
              </div>
              <div className="ml-4 flex items-center gap-1.5">
                <Badge
                  className={cn(
                    "rounded px-1.5 text-[11px] font-bold capitalize",
                    isRequest ? "bg-user/10 text-user" : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {entry.phase}
                </Badge>
                {entry.phase === "response" && (
                  <Badge
                    variant="outline"
                    className="rounded bg-muted px-1 font-mono text-[11px] font-bold text-muted-foreground"
                  >
                    T: {formatTokens(totalTokensOf(entry.usage))}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-0.5 flex shrink-0 items-center gap-2 text-muted-foreground">
              <span className="font-mono text-[11px]">{formatTime(entry.timestamp)}</span>
              <ChevronRight
                size={12}
                className="transition-transform group-data-[state=open]/entry:rotate-90"
                aria-hidden
              />
            </div>
          </div>

          {entry.phase === "response" && toolCallsIn(entry.content).length > 0 && (
            <div className="flex flex-wrap gap-1 pl-4 group-data-[state=open]/entry:hidden">
              {toolCallsIn(entry.content).map((toolCall) => (
                <span
                  key={toolCall.id}
                  className="flex items-center gap-1 rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 shadow-sm"
                >
                  <Zap size={10} aria-hidden />
                  {toolCall.name}
                </span>
              ))}
            </div>
          )}
        </CollapsibleTrigger>
        <CopyButton
          getText={() => serializeDebugEntry(entry, agentName)}
          label="Log entry"
          className={COPY_REVEAL}
        />
      </div>

      <CollapsibleContent className="mt-2 space-y-2 border-l border-border pl-4">
        {entry.phase === "request" ? (
          <RequestDetails entry={entry} />
        ) : (
          <ResponseDetails entry={entry} />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
})
