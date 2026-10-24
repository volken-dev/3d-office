/**
 * Returns `value`, or throws naming `what` when it is null or undefined. glTF-Transform types most
 * references as nullable; the generators know they are set, and fail loudly if a rig breaks that.
 */
export function requirePresent<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`)
  return value
}
