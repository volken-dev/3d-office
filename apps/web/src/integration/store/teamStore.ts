
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from '../../lib/storage';
import { AGENTIC_SETS, AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAgentSet } from '../../data/agents';
import { useShallow } from 'zustand/react/shallow';

/** Built-in team ids from before the switch to software-development teams. */
const LEGACY_TEAM_IDS = ['unboring-net', 'photo-studio', 'music-studio', 'film-studio', 'strategy-coach', 'pr-agency'];

export type AgentSet = AgenticSystem;

interface TeamState {
  selectedAgentSetId: string;
  customSystems: AgenticSystem[];

  saveCustomSystem: (system: AgenticSystem) => void;
  deleteCustomSystem: (id: string) => void;
  updateActiveSystem: (changes: Partial<AgenticSystem>) => void;
  updateSystem: (id: string, changes: Partial<AgenticSystem>) => void;
  setActiveTeam: (id: string) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedAgentSetId: DEFAULT_AGENTIC_SET_ID,
      customSystems: [],

      saveCustomSystem: (system) =>
        set((s) => ({
          customSystems: s.customSystems.some((cs) => cs.id === system.id)
            ? s.customSystems.map((cs) => (cs.id === system.id ? system : cs))
            : [...s.customSystems, system],
        })),

      deleteCustomSystem: (id) =>
        set((s) => ({
          customSystems: s.customSystems.filter((cs) => cs.id !== id),
          selectedAgentSetId: s.selectedAgentSetId === id ? DEFAULT_AGENTIC_SET_ID : s.selectedAgentSetId,
        })),

      updateActiveSystem: (changes) => set((s) => {
        const currentSystem = getAgentSet(s.selectedAgentSetId, s.customSystems);
        const updatedSystem = { ...currentSystem, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === updatedSystem.id)
            ? s.customSystems.map((cs) => (cs.id === updatedSystem.id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      updateSystem: (id, changes) => set((s) => {
        const system = getAgentSet(id, s.customSystems);
        const updatedSystem = { ...system, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === id)
            ? s.customSystems.map((cs) => (cs.id === id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      setActiveTeam: (id) => set({
        selectedAgentSetId: id,
      }),
    }),
    {
      name: 'team-storage',
      storage: safeJSONStorage(),
      version: 1,
      migrate: (persisted: any, version) => {
        if (version < 1 && persisted) {
          // v1 dropped media output types: remove saved edits of the old built-in teams
          // and strip the obsolete output fields from user-created teams.
          const customSystems: AgenticSystem[] = (persisted.customSystems ?? [])
            .filter((s: any) => !LEGACY_TEAM_IDS.includes(s.id))
            .map(({ outputType, outputModel, ...rest }: any) => rest);
          const knownIds = [...customSystems, ...AGENTIC_SETS].map((s) => s.id);
          const selectedAgentSetId = knownIds.includes(persisted.selectedAgentSetId)
            ? persisted.selectedAgentSetId
            : DEFAULT_AGENTIC_SET_ID;
          return { ...persisted, customSystems, selectedAgentSetId };
        }
        return persisted;
      },
    }
  )
);

/** Returns the currently active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState();
  return getAgentSet(selectedAgentSetId, customSystems);
}

/** React hook for accessing the currently active team. */
export function useActiveTeam(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore(useShallow((s) => ({ selectedAgentSetId: s.selectedAgentSetId, customSystems: s.customSystems })));
  return getAgentSet(selectedAgentSetId, customSystems);
}
