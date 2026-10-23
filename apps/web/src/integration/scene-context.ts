import React from "react"
import type { SceneStoreAdapter } from "./scene-store-adapter"

/** Gives components the imperative scene API (startChat, sendMessage, resetScene); state still comes from the stores. */
export const SceneContext = React.createContext<SceneStoreAdapter | null>(null)

/** Returns null outside the provider or before the scene exists, so callers handle the not-ready case. */
export function useScene(): SceneStoreAdapter | null {
  return React.useContext(SceneContext)
}
