import { canChatWith } from "../../core/orchestration/policy"
import { isLeadAgent } from "../../data/agents"
import { useCoreStore } from "../store/coreStore"
import { useActiveTeam } from "../store/teamStore"
import { useUiStore } from "../store/uiStore"

export interface ChatAvailability {
  canChat: boolean
  reason: string
}

/** Whether the user can chat with an agent, using the same rule the agent runtime applies. */
export function useChatAvailability(agentIndex: number | null): ChatAvailability {
  const phase = useCoreStore((state) => state.phase)
  const activeTaskTitle = useCoreStore((state) =>
    agentIndex === null
      ? undefined
      : state.tasks.find(
          (task) => task.assignedAgentId === agentIndex && task.status === "in_progress",
        )?.title,
  )
  const status = useUiStore((state) =>
    agentIndex !== null ? state.agentStatuses[agentIndex] : undefined,
  )
  const system = useActiveTeam()

  if (agentIndex === null) return { canChat: false, reason: "" }
  const isLead = isLeadAgent(system, agentIndex)
  if (canChatWith({ phase, isLead, status })) return { canChat: true, reason: "" }

  if (phase === "done") return { canChat: false, reason: "Project completed" }
  if (phase === "idle") return { canChat: false, reason: "Waiting for brief" }
  if (status === "on_hold") return { canChat: false, reason: "Review requested..." }
  return {
    canChat: false,
    reason: activeTaskTitle ? `Working on: "${activeTaskTitle}"` : "Agent is busy",
  }
}
