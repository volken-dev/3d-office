import { create } from 'zustand';
import { getAllAgents } from '../../data/agents';
import { AgentState, CharacterState } from '../../types';
import { useTeamStore, getActiveAgentSet } from './teamStore';
import { DEFAULT_MODEL } from '../../core/llm/constants';

export const useUiStore = create<CharacterState>()(
  (set) => ({
    isThinking: false,
    instanceCount: getAllAgents(getActiveAgentSet()).length + 1, // +1 for user

    selectedNpcIndex: null,
    hoveredNpcIndex: null,
    hoveredPoiId: null,
    hoveredPoiLabel: null,
    hoverPosition: null,
    isChatting: false,
    isTyping: false,
    chatMessages: [],
    inspectorTab: 'info',
    agentStatuses: {},
    setAgentStatus: (index: number, status: AgentState) => set((s) => ({
      agentStatuses: { ...s.agentStatuses, [index]: status }
    })),

    isBYOKOpen: false,
    byokError: null,
    setBYOKOpen: (open: boolean, error: string | null = null) =>
      set({ isBYOKOpen: open, byokError: error }),

    activeAuditTaskId: null,
    setActiveAuditTaskId: (taskId: string | null) => set({ activeAuditTaskId: taskId }),

    llmConfig: (() => {
      try {
        const saved = localStorage.getItem('byok-config');
        if (saved) return JSON.parse(saved);
      } catch { }
      return {
        apiKey: '',
        model: DEFAULT_MODEL
      };
    })(),

    setThinking: (isThinking: boolean) => set({ isThinking }),
    setIsTyping: (isTyping: boolean) => set({ isTyping }),
    setInspectorTab: (tab: 'info' | 'chat') => set({ inspectorTab: tab }),
    setInstanceCount: (count: number) => set({ instanceCount: count }),

    setSelectedNpc: (index: number | null) => set({ selectedNpcIndex: index }),
    // Hover handlers fire on every pointer move; skip no-op updates so subscribers don't re-render.
    // Agent bubbles track the character via screenPositions, so only POIs need a stored position.
    setHoveredNpc: (index: number | null) => set((s) =>
      s.hoveredNpcIndex === index && s.hoveredPoiId === null
        ? s
        : { hoveredNpcIndex: index, hoverPosition: null, hoveredPoiId: null, hoveredPoiLabel: null }),
    setHoveredPoi: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => set((s) =>
      s.hoveredPoiId === id && s.hoveredNpcIndex === null
        ? s
        : { hoveredPoiId: id, hoveredPoiLabel: label, hoverPosition: pos, hoveredNpcIndex: null }),
    setLlmConfig: (config) => set((s) => ({ llmConfig: { ...s.llmConfig, ...config } })),
    setChatting: (isChatting: boolean) => set((s) => ({ 
      isChatting, 
      isTyping: isChatting ? s.isTyping : false,
      isThinking: isChatting ? s.isThinking : false,
      chatMessages: isChatting ? s.chatMessages : []
    })),
  })
);

// Keep instanceCount in sync whenever the active agent set changes
useTeamStore.subscribe((state, prevState) => {
  if (state.selectedAgentSetId !== prevState.selectedAgentSetId) {
    const system = getActiveAgentSet();
    useUiStore.getState().setInstanceCount(getAllAgents(system).length + 1);
  }
});
