import type { SceneCast } from "./scene-cast"

/** Whether the scene renders (`simulation`) or is paused behind an editor (`design`). */
export type SceneViewMode = "simulation" | "design"

/** The office's lighting: day, or night with its lamps and night sky. */
export type TimeOfDay = "day" | "night"

/**
 * A change the scene should act on. The scene only executes these; the host decides what agent
 * states mean and when it is night. `state` is one of the office's agent state names (its
 * `agentStates` extras); an unknown state is ignored with a warning.
 */
export type SceneIntent =
  | { type: "setCast"; cast: SceneCast }
  | { type: "setAgentState"; agentIndex: number; state: string }
  | { type: "setTimeOfDay"; timeOfDay: TimeOfDay }
  | { type: "setViewMode"; viewMode: SceneViewMode }
