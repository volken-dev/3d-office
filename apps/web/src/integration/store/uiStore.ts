import type { LLMConfig } from "@the-delegation/agents/llm/types"
import type { AgentWorkStatus } from "@the-delegation/agents/project/types"
import { create } from "zustand"
import { loadLlmConfig, saveLlmConfig } from "../settings/llmConfigStorage"

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

  isBYOKOpen: boolean
  byokError: string | null
  setBYOKOpen: (open: boolean, error?: string | null) => void

  activeAuditTaskId: string | null
  setActiveAuditTaskId: (taskId: string | null) => void

  llmConfig: LLMConfig
  /** Updates and persists the BYOK config. Returns false if the browser refused to store it (kept for this session only). */
  setLlmConfig: (config: Partial<LLMConfig>) => boolean

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

/** Transient UI state (selection, hover, chat, dialogs) plus the BYOK config, which persists through llmConfigStorage. */
export const useUiStore = create<UiState>()((set, get) => ({
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

  isBYOKOpen: false,
  byokError: null,
  setBYOKOpen: (open, error = null) => set({ isBYOKOpen: open, byokError: error }),

  activeAuditTaskId: null,
  setActiveAuditTaskId: (taskId) => set({ activeAuditTaskId: taskId }),

  llmConfig: loadLlmConfig(),
  setLlmConfig: (config) => {
    set((state) => ({ llmConfig: { ...state.llmConfig, ...config } }))
    return saveLlmConfig(get().llmConfig)
  },

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
