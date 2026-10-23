import type { AgentWorkStatus } from "@the-delegation/agents/project/types"
import { create } from "zustand"
import { type GatewayStatus, probeGateway } from "../llm/gateway-status"

export interface UiState {
  /** True while the selected agent is answering a chat message. */
  isThinking: boolean
  selectedNpcIndex: number | null
  hoveredNpcIndex: number | null
  hoveredPoiId: string | null
  hoveredPoiLabel: string | null
  hoverPosition: { x: number; y: number } | null
  isChatting: boolean
  isTyping: boolean

  /** Mirror of each AgentHost's work status, for rendering. AgentHost.setState is the only writer. */
  agentStatuses: Record<number, AgentWorkStatus>
  setAgentStatus: (index: number, status: AgentWorkStatus) => void

  gatewayStatus: GatewayStatus
  /** Probes the model gateway's health and records the result. Safe to call repeatedly. */
  checkGateway: () => Promise<GatewayStatus>

  activeAuditTaskId: string | null
  setActiveAuditTaskId: (taskId: string | null) => void

  setIsTyping: (isTyping: boolean) => void
  setSelectedNpc: (index: number | null) => void
  /**
   * Fires on every pointer move, so no-op updates are skipped to spare subscribers a re-render.
   * Agent bubbles track the character via screenPositions, so only POIs store a hover position.
   */
  setHoveredNpc: (index: number | null) => void
  /** Fires on every pointer move; no-op updates are skipped to spare subscribers a re-render. */
  setHoveredPoi: (
    id: string | null,
    label: string | null,
    position: { x: number; y: number } | null,
  ) => void
  setChatting: (isChatting: boolean) => void
}

/** Transient UI state: selection, hover, chat, dialogs and the model gateway status. */
export const useUiStore = create<UiState>()((set) => ({
  isThinking: false,

  selectedNpcIndex: null,
  hoveredNpcIndex: null,
  hoveredPoiId: null,
  hoveredPoiLabel: null,
  hoverPosition: null,
  isChatting: false,
  isTyping: false,
  agentStatuses: {},
  setAgentStatus: (index, status) =>
    set((state) =>
      state.agentStatuses[index] === status
        ? state
        : { agentStatuses: { ...state.agentStatuses, [index]: status } },
    ),

  gatewayStatus: "checking",
  checkGateway: async () => {
    const status = await probeGateway()
    set((state) => (state.gatewayStatus === status ? state : { gatewayStatus: status }))
    return status
  },

  activeAuditTaskId: null,
  setActiveAuditTaskId: (taskId) => set({ activeAuditTaskId: taskId }),

  setIsTyping: (isTyping) => set((state) => (state.isTyping === isTyping ? state : { isTyping })),

  setSelectedNpc: (index) => set({ selectedNpcIndex: index }),
  setHoveredNpc: (index) =>
    set((state) =>
      state.hoveredNpcIndex === index && state.hoveredPoiId === null
        ? state
        : {
            hoveredNpcIndex: index,
            hoverPosition: null,
            hoveredPoiId: null,
            hoveredPoiLabel: null,
          },
    ),
  setHoveredPoi: (id, label, position) =>
    set((state) =>
      state.hoveredPoiId === id && state.hoveredNpcIndex === null
        ? state
        : {
            hoveredPoiId: id,
            hoveredPoiLabel: label,
            hoverPosition: position,
            hoveredNpcIndex: null,
          },
    ),
  setChatting: (isChatting) =>
    set((state) => ({
      isChatting,
      isTyping: isChatting ? state.isTyping : false,
      isThinking: isChatting ? state.isThinking : false,
    })),
}))
