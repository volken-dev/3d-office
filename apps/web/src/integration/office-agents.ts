import { useSyncExternalStore } from "react"
import type { AgentState } from "../data/agent-states"

/** What the scene last reported for one robot. */
export interface AgentStatus {
  state: AgentState
  /** The contract's status colour for the state, as `#rrggbb`. */
  statusColor: string
}

/** The pills' view of the office: each slot's status (null until one arrives) and the selection. */
export interface OfficeAgentsSnapshot {
  statuses: ReadonlyMap<number, AgentStatus | null>
  selectedAgentIndex: number | null
}

let snapshot: OfficeAgentsSnapshot = { statuses: new Map(), selectedAgentIndex: null }
const listeners = new Set<() => void>()

function publish(next: OfficeAgentsSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

/** Records a robot's status as the scene reports it; a repeat of the current status is ignored. */
export function setAgentStatus(agentIndex: number, state: AgentState, statusColor: string): void {
  const current = snapshot.statuses.get(agentIndex)
  if (current && current.state === state && current.statusColor === statusColor) return
  const statuses = new Map(snapshot.statuses)
  statuses.set(agentIndex, { state, statusColor })
  publish({ ...snapshot, statuses })
}

/** Selects a robot (from a pill or a canvas click), or clears the selection with null. */
export function selectAgent(agentIndex: number | null): void {
  if (snapshot.selectedAgentIndex === agentIndex) return
  publish({ ...snapshot, selectedAgentIndex: agentIndex })
}

/**
 * Starts the store over for a cast (a new or rebuilt scene): every slot back to no status and no
 * selection. Nothing is published when it is already in that state.
 */
export function resetOfficeAgents(agentIndices: readonly number[]): void {
  const isAlreadyReset =
    snapshot.selectedAgentIndex === null &&
    snapshot.statuses.size === agentIndices.length &&
    agentIndices.every(
      (agentIndex) =>
        snapshot.statuses.has(agentIndex) && snapshot.statuses.get(agentIndex) === null,
    )
  if (isAlreadyReset) return
  publish({
    statuses: new Map(agentIndices.map((agentIndex) => [agentIndex, null])),
    selectedAgentIndex: null,
  })
}

/** Subscribes to changes; returns the unsubscribe function. */
export function subscribeToOfficeAgents(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current snapshot; the same object until something changes. */
export function getOfficeAgentsSnapshot(): OfficeAgentsSnapshot {
  return snapshot
}

/** The office agents' statuses and selection, re-rendering only when they change. */
export function useOfficeAgents(): OfficeAgentsSnapshot {
  return useSyncExternalStore(
    subscribeToOfficeAgents,
    getOfficeAgentsSnapshot,
    getOfficeAgentsSnapshot,
  )
}
