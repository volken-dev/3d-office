import type { SceneCast } from "./scene-cast"

/** What the scene renders while the editor is open (paused) or not. */
export type SceneViewMode = "simulation" | "design"

/** Who is busy and whether the project is delivered, pushed to the NPC drivers. */
export interface AgentWork {
  busyAgentIndices: readonly number[]
  isProjectDone: boolean
}

/**
 * A change the scene should act on, derived from store state. The scene only executes these; it
 * never decides what a task status or a UI flag means.
 */
export type SceneIntent =
  | { type: "syncAgentWork"; work: AgentWork }
  /** `deskSlot` is the agent's position among the team's agents, for picking a fallback desk. */
  | { type: "goToDesk"; agentIndex: number; deskSlot: number }
  | { type: "goToBoardroom"; agentIndex: number }
  | { type: "returnToSpawn"; agentIndex: number }
  | { type: "setChatMode"; isChatting: boolean }
  | { type: "startChat"; agentIndex: number }
  /** Who is talking in an open chat: the agent while it thinks, the user while typing. */
  | {
      type: "updateChatTurn"
      agentIndex: number
      isAgentSpeaking: boolean
      isUserSpeaking: boolean
    }
  /** `agentIndex` is the agent the chat was with, if one was selected. */
  | { type: "stopChat"; agentIndex: number | null }
  /** A different team, or agents added or removed: characters and drivers are rebuilt. */
  | { type: "replaceTeam"; cast: SceneCast }
  /** The same agents with edited details: only the simulation is updated. */
  | { type: "updateTeam"; cast: SceneCast }
  | { type: "layoutResizeStarted" }
  | { type: "layoutResizeSettled" }
  | { type: "setViewMode"; viewMode: SceneViewMode }
