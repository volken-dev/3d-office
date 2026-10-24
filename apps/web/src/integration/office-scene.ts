import { SceneManager } from "@the-delegation/scene/scene-manager"
import { isAgentState } from "../data/agent-states"
import { OFFICE_CAST } from "../data/office-cast"
import { publishFrameStats } from "./frame-stats"
import { startLiveDemo } from "./live-demo"
import { resetOfficeAgents, selectAgent, setAgentStatus } from "./office-agents"
import { watchTimeOfDay } from "./time-of-day"

/** The office scene and what drives it: the live demo, the local clock and robot selection. */
export interface OfficeSession {
  scene: SceneManager
  /** Follows a robot with the camera, or returns to the overview for null. */
  focusAgent(agentIndex: number | null): void
  /** Stops the demo and the clock, then disposes the scene. Idempotent. */
  dispose(): void
}

/**
 * Builds the office scene in `container` and connects it to the app: the local clock sets day or
 * night from the start, and once the scene is ready the live demo brings the robots in one at a
 * time (each joins the cast as it arrives, so they never crowd the door) and gives them their
 * states. Every accepted state reaches the agent store the pills read. Clicking a robot selects and follows it; clicking empty floor returns to the
 * overview. `onDeviceLost` fires once the GPU device is gone and the owner must rebuild the scene.
 */
export function createOfficeSession(
  container: HTMLElement,
  onDeviceLost: () => void,
): OfficeSession {
  resetOfficeAgents(OFFICE_CAST.agentIndices)
  const stops: (() => void)[] = []
  let isDisposed = false
  const arrivedAgentIndices = new Set<number>()

  const focusAgent = (agentIndex: number | null) => {
    selectAgent(agentIndex)
    scene.followAgent(agentIndex)
  }

  const scene: SceneManager = new SceneManager(
    container,
    { agentIndices: [] },
    {
      onAgentClick: focusAgent,
      onAgentStatus: (agentIndex, state, statusColor) => {
        if (isAgentState(state)) setAgentStatus(agentIndex, state, statusColor)
      },
      onDeviceLost,
      onFrameStats: process.env.NODE_ENV === "development" ? publishFrameStats : undefined,
    },
    { assetBaseUrl: "/" },
  )

  stops.push(watchTimeOfDay((timeOfDay) => scene.apply({ type: "setTimeOfDay", timeOfDay })))
  scene.ready.then(
    () => {
      if (isDisposed) return
      stops.push(
        startLiveDemo({
          agentIndices: OFFICE_CAST.agentIndices,
          onStateChange: ({ agentIndex, state }) => {
            if (!arrivedAgentIndices.has(agentIndex)) {
              arrivedAgentIndices.add(agentIndex)
              const agentIndices = OFFICE_CAST.agentIndices.filter((slot) =>
                arrivedAgentIndices.has(slot),
              )
              scene.apply({ type: "setCast", cast: { agentIndices } })
            }
            scene.apply({ type: "setAgentState", agentIndex, state })
          },
        }),
      )
    },
    () => {},
  )

  return {
    scene,
    focusAgent,
    dispose() {
      if (isDisposed) return
      isDisposed = true
      for (const stop of stops) stop()
      scene.dispose()
    },
  }
}
