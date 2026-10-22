import type { LLMToolCall } from "@the-delegation/agents/llm/types"

function parseArguments(raw: string | undefined): Record<string, unknown> | string | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : raw
  } catch {
    return raw
  }
}

/** Dark card showing a tool call's name and its arguments, used for both requests and responses. */
export function ToolCallCard({ call }: { call: LLMToolCall }) {
  const parsedArguments = parseArguments(call.function?.arguments)
  const entries =
    parsedArguments && typeof parsedArguments === "object" ? Object.entries(parsedArguments) : []

  return (
    <div className="overflow-hidden rounded-lg border border-primary bg-primary shadow-lg">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="font-mono text-xs font-black tracking-wider text-emerald-400">
          {call.function?.name || "(unknown)"}
        </span>
        <span className="text-[11px] font-bold tracking-tight text-zinc-400">Arguments</span>
      </div>
      <div className="bg-primary/50 p-2.5">
        {typeof parsedArguments === "string" ? (
          <pre className="font-mono text-[11px] break-words whitespace-pre-wrap text-zinc-300">
            {parsedArguments}
          </pre>
        ) : entries.length > 0 ? (
          <dl className="space-y-1.5">
            {entries.map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-bold tracking-tight text-zinc-400">{key}</dt>
                <dd className="rounded border border-zinc-700/50 bg-primary/50 p-1.5 font-mono text-[11px] break-words whitespace-pre-wrap text-zinc-300">
                  {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-[11px] text-zinc-400 italic">No arguments</span>
        )}
      </div>
    </div>
  )
}
