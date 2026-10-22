import React from "react"
import type { SceneManager } from "./SceneManager"

/** Gives components the imperative scene API (startChat, sendMessage, resetScene); state still comes from the stores. */
export const SceneContext = React.createContext<SceneManager | null>(null)

/** Returns null outside the provider or before the scene exists, so callers handle the not-ready case. */
export function useSceneManager(): SceneManager | null {
  return React.useContext(SceneContext)
}
