import { blockText, toolCallsIn } from "@the-delegation/agents/agent/history"
import type { DebugLogEntry } from "../integration/store/core-store"

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2)
}

/** Plain-text dump of one technical log entry, shared by per-entry copy and "download all". */
export function serializeDebugEntry(entry: DebugLogEntry, agentName: string): string {
  const header = [
    "=========================================",
    `AGENT: ${agentName} (${entry.phase})`,
    `TIME: ${new Date(entry.timestamp).toLocaleString()}`,
    "=========================================",
  ].join("\n")

  const body =
    entry.phase === "request"
      ? [
          `SYSTEM INSTRUCTION:\n${entry.systemInstruction || "None"}`,
          `MESSAGES:\n${toPrettyJson(entry.contents)}`,
          `SYSTEM TOOLS:\n${toPrettyJson(entry.systemTools)}`,
        ]
      : [
          `CONTENT:\n${blockText(entry.content) || "None"}`,
          `TOOL CALLS:\n${toPrettyJson(toolCallsIn(entry.content))}`,
          `USAGE:\n${toPrettyJson(entry.usage)}`,
          `RAW RESPONSE:\n${toPrettyJson(entry.raw)}`,
        ]

  return [header, ...body].join("\n\n")
}
