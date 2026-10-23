import { useUiStore } from "../../integration/store/uiStore"

/** Selects a character from the UI (or clears the selection), ending any open chat first like a canvas click does. */
export function selectAgent(index: number | null) {
  const ui = useUiStore.getState()
  if (ui.isChatting) ui.setChatting(false)
  ui.setSelectedNpc(index)
}
