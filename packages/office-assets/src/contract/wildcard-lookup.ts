/**
 * Looks a key up in a contract table whose keys may end in a wildcard (`stand-*` covers
 * `stand-deploy`), the exact key winning.
 */
export function wildcardLookup<Value>(
  table: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  if (Object.hasOwn(table, key)) return table[key]
  const match = Object.entries(table).find(
    ([pattern]) => pattern.endsWith("*") && key.startsWith(pattern.slice(0, -1)),
  )
  return match?.[1]
}
