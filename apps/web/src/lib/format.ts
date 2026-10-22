/** Compact token count for tight UI (1.2k, 3M), dropping a trailing ".0". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return count.toString()
}

/** 24-hour HH:MM:SS, fixed to en-GB so log timestamps read the same in every locale. */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
