import { SceneManager } from "@the-delegation/scene/scene-manager"
import type { ScreenPositionSink } from "@the-delegation/scene/screen-position-sink"
import { OFFICE_CAST, PLAYER_INDEX } from "../data/office-cast"
import { publishFrameStats } from "./frame-stats"

/** Nothing is drawn over the canvas, so character anchors are not needed. */
const IGNORED_SCREEN_POSITIONS: ScreenPositionSink = {
  set: () => {},
  clear: () => {},
  notify: () => {},
}

/** The camera follows a clicked character; the player's own character or empty space follows the player. */
export function followTargetForClick(clickedIndex: number | null): number | null {
  return clickedIndex === PLAYER_INDEX ? null : clickedIndex
}

/**
 * Builds the office scene in `container` with the fixed cast. `onDeviceLost` fires once the GPU
 * device is gone and the owner must rebuild the scene.
 */
export function createOfficeScene(container: HTMLElement, onDeviceLost: () => void): SceneManager {
  const scene: SceneManager = new SceneManager(
    container,
    OFFICE_CAST,
    {
      onAgentClick: (clickedIndex) => scene.followAgent(followTargetForClick(clickedIndex)),
      onAgentHover: () => {},
      onPoiHover: () => {},
      onDeviceLost,
      onFrameStats: process.env.NODE_ENV === "development" ? publishFrameStats : undefined,
    },
    { assetBaseUrl: "/", screenPositions: IGNORED_SCREEN_POSITIONS },
  )
  return scene
}
