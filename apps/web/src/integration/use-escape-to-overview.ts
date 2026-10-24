import { useEffect, useRef } from "react"
import { selectAgent } from "./office-agents"

/** Matches the pills' container (`data-agent-pills` on `AgentPills`), so Esc can blur a pill. */
const AGENT_PILLS_SELECTOR = "[data-agent-pills]"

/**
 * Esc returns to the overview: on a window Escape that nothing else handled (a dialog calls
 * `preventDefault`), it clears the selected robot, calls `onClear` (the host returns the camera)
 * and blurs a focused pill, so focus does not reselect it.
 */
export function useEscapeToOverview(onClear: () => void): void {
  const onClearRef = useRef(onClear)
  useEffect(() => {
    onClearRef.current = onClear
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      selectAgent(null)
      onClearRef.current()
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.closest(AGENT_PILLS_SELECTOR)) {
        focused.blur()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
