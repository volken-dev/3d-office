import { useEffect } from "react"
import { toast } from "sonner"
import { useCoreStore } from "../../integration/store/core-store"
import { getActiveTeamRoster } from "../../integration/store/team-store"
import { useUiStore } from "../../integration/store/ui-store"

/** Announces new review requests, which are otherwise only visible as bubbles in the 3D scene. */
export function ReviewRequestToasts() {
  useEffect(
    () =>
      useCoreStore.subscribe((state, previousState) => {
        if (state.tasks === previousState.tasks) return
        const wasOnHold = new Set(
          previousState.tasks.filter((task) => task.status === "on_hold").map((task) => task.id),
        )
        for (const task of state.tasks) {
          if (task.status !== "on_hold" || wasOnHold.has(task.id)) continue
          const agent = getActiveTeamRoster().byIndex.get(task.assignedAgentId)
          toast(`${agent?.name ?? "An agent"} needs your review`, {
            id: `review-${task.id}`,
            description: task.title,
            action: {
              label: "Review",
              onClick: () => useUiStore.getState().setActiveAuditTaskId(task.id),
            },
          })
        }
      }),
    [],
  )
  return null
}
