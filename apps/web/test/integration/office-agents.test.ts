import { beforeEach, describe, expect, test } from "bun:test"
import {
  getOfficeAgentsSnapshot,
  resetOfficeAgents,
  selectAgent,
  setAgentStatus,
  subscribeToOfficeAgents,
} from "../../src/integration/office-agents"

const AGENT_INDICES = [1, 2, 3, 4, 5]

function countNotifications(): { count: () => number; stop: () => void } {
  let notifications = 0
  const stop = subscribeToOfficeAgents(() => {
    notifications++
  })
  return { count: () => notifications, stop }
}

describe("office agents store", () => {
  beforeEach(() => {
    resetOfficeAgents(AGENT_INDICES)
  })

  test("a reset gives every slot no status and clears the selection", () => {
    setAgentStatus(2, "working", "#22c55e")
    selectAgent(2)
    resetOfficeAgents(AGENT_INDICES)
    const snapshot = getOfficeAgentsSnapshot()
    expect(snapshot.selectedAgentIndex).toBeNull()
    expect([...snapshot.statuses.entries()]).toEqual(
      AGENT_INDICES.map((agentIndex) => [agentIndex, null]),
    )
  })

  test("notifies only on real changes", () => {
    const notifications = countNotifications()
    setAgentStatus(1, "working", "#22c55e")
    setAgentStatus(1, "working", "#22c55e")
    expect(notifications.count()).toBe(1)
    setAgentStatus(1, "working", "#16a34a")
    setAgentStatus(1, "error", "#16a34a")
    expect(notifications.count()).toBe(3)
    selectAgent(3)
    selectAgent(3)
    expect(notifications.count()).toBe(4)
    selectAgent(null)
    selectAgent(null)
    expect(notifications.count()).toBe(5)
    resetOfficeAgents(AGENT_INDICES)
    resetOfficeAgents(AGENT_INDICES)
    expect(notifications.count()).toBe(6)
    notifications.stop()
  })

  test("keeps the snapshot stable until something changes", () => {
    const before = getOfficeAgentsSnapshot()
    setAgentStatus(4, "idle", "#facc15")
    const afterChange = getOfficeAgentsSnapshot()
    expect(afterChange).not.toBe(before)
    expect(afterChange.statuses.get(4)).toEqual({ state: "idle", statusColor: "#facc15" })
    expect(before.statuses.get(4)).toBeNull()
    setAgentStatus(4, "idle", "#facc15")
    selectAgent(null)
    expect(getOfficeAgentsSnapshot()).toBe(afterChange)
  })

  test("a stopped subscriber is not notified", () => {
    const notifications = countNotifications()
    notifications.stop()
    selectAgent(1)
    expect(notifications.count()).toBe(0)
  })
})
