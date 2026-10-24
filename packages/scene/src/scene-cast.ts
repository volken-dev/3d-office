/**
 * Which robots the scene draws, by slot. Slot N is the robot's pod N, docking bay N and status
 * texel N, from 1 to the office's `agents.max`; the host owns what a slot means beyond that.
 */
export interface SceneCast {
  agentIndices: readonly number[]
}
