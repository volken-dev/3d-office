import { init } from "@recast-navigation/core"

let runtime: Promise<void> | null = null

/**
 * Loads the Recast/Detour WebAssembly module once per page. The navmesh and crowd can only be
 * built after it resolves. Memoised because recast's own `init` is not safe to call concurrently
 * (React strict mode mounts the scene twice), and a second module would split objects between two
 * WebAssembly heaps.
 */
export function loadNavigationRuntime(): Promise<void> {
  runtime ??= init().catch((error: unknown) => {
    runtime = null
    throw error
  })
  return runtime
}
