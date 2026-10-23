import type { ProjectSnapshot } from "../orchestration/ports"
import type { AgentWorkStatus } from "../project/types"

/** The parts of an agent's runtime state the board rule looks at. */
export interface HostView {
  agentIndex: number
  state: AgentWorkStatus
  currentTaskId: string | null
}

/** What a board change means for one agent: cancel its call in flight, and/or free it for new work. */
export interface BoardReaction {
  abortTurn: boolean
  releaseHost: boolean
}

const NO_REACTION: BoardReaction = Object.freeze({ abortTurn: false, releaseHost: false })

/**
 * Keeps an agent in step with the board. A reset cancels its call and frees it; removing its task
 * does the same; once the user approves or rejects its last task under review, it is freed from
 * on_hold.
 */
export function reactToBoardChange(
  next: ProjectSnapshot,
  previous: ProjectSnapshot,
  host: HostView,
): BoardReaction {
  if (next.runId !== previous.runId) {
    return { abortTurn: true, releaseHost: host.state !== "idle" || host.currentTaskId !== null }
  }
  if (next.tasks === previous.tasks) return NO_REACTION

  const { currentTaskId } = host
  if (currentTaskId && !next.tasks.some((task) => task.id === currentTaskId)) {
    return { abortTurn: true, releaseHost: true }
  }
  const stillUnderReview = next.tasks.some(
    (task) => task.assignedAgentId === host.agentIndex && task.status === "on_hold",
  )
  return host.state === "on_hold" && !stillUnderReview
    ? { abortTurn: false, releaseHost: true }
    : NO_REACTION
}
