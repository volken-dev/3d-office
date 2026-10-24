/**
 * A record's own entry for a key, or undefined. Records parsed from files are plain objects, so a
 * bare index would also find inherited members such as `constructor` for a crafted key.
 */
export function ownEntry<Value>(
  record: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}
