import { SceneManager } from "@the-delegation/scene/scene-manager"
import { OFFICE_CAST } from "../data/office-cast"
import { publishFrameStats } from "./frame-stats"

/** TODO(#88): replaced by the live demo; until then each robot gets one state so they move. */
const FIRST_STATES = ["working", "shipping", "idle", "paused_or_rate_limited", "error"] as const

/**
 * Builds the office scene in `container` with the fixed cast. Clicking a robot follows it and
 * clicking empty floor returns to the overview. `onDeviceLost` fires once the GPU device is gone
 * and the owner must rebuild the scene.
 */
export function createOfficeScene(container: HTMLElement, onDeviceLost: () => void): SceneManager {
  const scene: SceneManager = new SceneManager(
    container,
    OFFICE_CAST,
    {
      onAgentClick: (clickedIndex) => scene.followAgent(clickedIndex),
      onAgentStatus: () => {},
      onDeviceLost,
      onFrameStats: process.env.NODE_ENV === "development" ? publishFrameStats : undefined,
    },
    { assetBaseUrl: "/" },
  )
  scene.ready.then(
    () => {
      OFFICE_CAST.agentIndices.forEach((agentIndex, castOrder) => {
        const state = FIRST_STATES[castOrder % FIRST_STATES.length] ?? "idle"
        scene.apply({ type: "setAgentState", agentIndex, state })
      })
    },
    () => {},
  )
  return scene
}
