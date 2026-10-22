import { type AgenticSystem, isValidAgenticSystem } from "@the-delegation/agents/team"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useShallow } from "zustand/react/shallow"
import {
  AGENTIC_SETS,
  DEFAULT_AGENTIC_SET_ID,
  getAgentSet,
  getTeamRoster,
  type TeamRoster,
} from "../../data/agents"
import { safeJSONStorage } from "../../lib/storage"

/** Built-in team ids from before the switch to software-development teams. */
const LEGACY_TEAM_IDS = [
  "unboring-net",
  "photo-studio",
  "music-studio",
  "film-studio",
  "strategy-coach",
  "pr-agency",
]

interface TeamState {
  selectedAgentSetId: string
  customSystems: AgenticSystem[]

  /** Inserts or replaces a team by id (built-in teams are stored as custom copies once edited). */
  upsertSystem: (system: AgenticSystem) => void
  /** Applies changes to the team with this id, creating a custom copy of a built-in team if needed. */
  patchSystem: (id: string, changes: Partial<AgenticSystem>) => void
  deleteCustomSystem: (id: string) => void
  setActiveTeam: (id: string) => void
}

type PersistedTeamState = Pick<TeamState, "selectedAgentSetId" | "customSystems">

/** A team as persisted before v1, which still carried the media output fields v1 dropped. */
type StoredAgenticSystem = AgenticSystem & { outputType?: unknown; outputModel?: unknown }

function upsert(list: AgenticSystem[], system: AgenticSystem): AgenticSystem[] {
  return list.some((existing) => existing.id === system.id)
    ? list.map((existing) => (existing.id === system.id ? system : existing))
    : [...list, system]
}

function stripObsoleteFields(system: StoredAgenticSystem): AgenticSystem {
  const { outputType: _outputType, outputModel: _outputModel, ...rest } = system
  return rest
}

/**
 * Drops invalid or legacy teams and falls back to the default team when the selection is unknown.
 * v1 dropped media output types, so their obsolete fields are stripped from user-created teams.
 */
function sanitize(persisted: unknown, dropLegacy: boolean): PersistedTeamState {
  const isObject = typeof persisted === "object" && persisted !== null
  const storedSystems =
    isObject && "customSystems" in persisted && Array.isArray(persisted.customSystems)
      ? persisted.customSystems
      : []
  const storedSelection =
    isObject && "selectedAgentSetId" in persisted ? persisted.selectedAgentSetId : undefined

  const customSystems = storedSystems
    .filter(isValidAgenticSystem)
    .filter((system) => !dropLegacy || !LEGACY_TEAM_IDS.includes(system.id))
    .map(stripObsoleteFields)
  const knownIds = [...customSystems, ...AGENTIC_SETS].map((system) => system.id)
  const selectedAgentSetId =
    typeof storedSelection === "string" && knownIds.includes(storedSelection)
      ? storedSelection
      : DEFAULT_AGENTIC_SET_ID
  return { customSystems, selectedAgentSetId }
}

/**
 * The selected team and the user's custom teams, persisted under "team-storage". Persisted state
 * is validated on every load, not only on version bumps, so one corrupt team cannot crash the app
 * at startup.
 */
export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedAgentSetId: DEFAULT_AGENTIC_SET_ID,
      customSystems: [],

      upsertSystem: (system) =>
        set((state) => ({ customSystems: upsert(state.customSystems, system) })),

      patchSystem: (id, changes) =>
        set((state) => ({
          customSystems: upsert(state.customSystems, {
            ...getAgentSet(id, state.customSystems),
            ...changes,
          }),
        })),

      deleteCustomSystem: (id) =>
        set((state) => ({
          customSystems: state.customSystems.filter((system) => system.id !== id),
          selectedAgentSetId:
            state.selectedAgentSetId === id ? DEFAULT_AGENTIC_SET_ID : state.selectedAgentSetId,
        })),

      setActiveTeam: (id) => set({ selectedAgentSetId: id }),
    }),
    {
      name: "team-storage",
      storage: safeJSONStorage(),
      version: 1,
      partialize: (state): PersistedTeamState => ({
        selectedAgentSetId: state.selectedAgentSetId,
        customSystems: state.customSystems,
      }),
      migrate: (persisted, version) => sanitize(persisted, version < 1),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted, false) }),
    },
  ),
)

/** The currently active team. Safe to call outside React. */
export function getActiveAgentSet(): AgenticSystem {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState()
  return getAgentSet(selectedAgentSetId, customSystems)
}

/** Memoized roster (agents, characters, index lookup) of the active team. Safe to call outside React. */
export function getActiveTeamRoster(): TeamRoster {
  return getTeamRoster(getActiveAgentSet())
}

/** React hook for the currently active team. */
export function useActiveTeam(): AgenticSystem {
  const { selectedAgentSetId, customSystems } = useTeamStore(
    useShallow((state) => ({
      selectedAgentSetId: state.selectedAgentSetId,
      customSystems: state.customSystems,
    })),
  )
  return getAgentSet(selectedAgentSetId, customSystems)
}

/** React hook for the active team's memoized roster; use `byIndex.get(agentIndex)` instead of `getAllAgents(team).find(...)`. */
export function useTeamRoster(): TeamRoster {
  return getTeamRoster(useActiveTeam())
}
