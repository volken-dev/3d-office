import { useCallback, useSyncExternalStore } from "react"

/** Subscribes to a CSS media query; the server snapshot assumes desktop so the static export renders the docked layout. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQueryList = window.matchMedia(query)
      mediaQueryList.addEventListener("change", onChange)
      return () => mediaQueryList.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  )
}

/** Matches Tailwind's `lg` breakpoint, where the side panels dock beside the canvas. */
export const DESKTOP_QUERY = "(min-width: 1024px)"
