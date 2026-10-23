import { appendToHistory } from "@the-delegation/agents/agent/history"
import type { AgentMessage } from "@the-delegation/agents/llm/types"
import {
  LLM_CALL_BUDGET,
  MAX_ACTION_LOG,
  MAX_DEBUG_LOG,
  MAX_HISTORY_PER_AGENT,
} from "@the-delegation/agents/orchestration/policy"
import type {
  ActionLogEntry,
  AutonomyPause,
  DebugLogEntry,
  IntentAttempts,
  NewTask,
  ProjectPhase,
  RequestDebugLogEntry,
  ResponseDebugLogEntry,
  Task,
  TaskStatus,
} from "@the-delegation/agents/project/types"
import { costOfUsage, findModel } from "@the-delegation/llm/registry"
import type { Usage } from "@the-delegation/shared/llm-messages"
import { create } from "zustand"
import { EMPTY_USAGE } from "../../lib/usage"
import { useTeamStore } from "./teamStore"

export type {
  ActionLogEntry,
  AutonomyPause,
  DebugLogEntry,
  ProjectPhase,
  RequestDebugLogEntry,
  ResponseDebugLogEntry,
  Task,
  TaskRevision,
  TaskStatus,
} from "@the-delegation/agents/project/types"

interface CoreState {
  /** Incremented on every reset; in-flight agent work from an older run is discarded. */
  runId: number
  userBrief: string
  phase: ProjectPhase
  finalOutput: string | null
  /** When the user approved (or auto-approval accepted) the final deliverable. */
  finalizedAt: number | null
  totalTokenUsage: Usage
  /** Only agents that have made a call have an entry. */
  agentTokenUsage: Partial<Record<number, Usage>>
  totalEstimatedCost: number
  agentEstimatedCost: Record<number, number>

  /** The review dialog is open. */
  isReviewingOutput: boolean
  /** The lead's deliverable awaiting the user's approval; kept while the dialog is closed with "Review later". */
  pendingOutputPrompt: string

  tasks: Task[]

  actionLog: ActionLogEntry[]
  debugLog: DebugLogEntry[]

  agentHistories: Record<number, AgentMessage[]>

  /** Set when autonomous agent work stopped and is waiting for the user to resume it. */
  autonomyPause: AutonomyPause | null
  intentAttempts: Record<string, IntentAttempts>
  llmCallCount: number
  llmCallLimit: number

  // TODO(#14): UI layout state below belongs in a layout store.
  viewMode: "simulation" | "design"
  isFinalOutputOpen: boolean
  logFilterAgentIndex: number | null
  isResizing: boolean

  startProject: (brief: string) => void
  setReviewingOutput: (isReviewing: boolean) => void
  setPendingOutputPrompt: (prompt: string) => void
  /** Hands the lead's deliverable to the user for review; the project stays 'working' until approved. */
  requestOutputReview: (output: string) => void
  finalizeOutput: (output: string) => void
  resetProject: () => void

  addTask: (task: NewTask) => Task
  /** Completion is left to the simulation, which routes it through the lead's delivery. */
  removeTask: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  submitTaskForReview: (taskId: string, draftOutput?: string) => void
  completeTask: (taskId: string, output: string) => void
  setTaskError: (taskId: string, error: string | undefined) => void
  /** The owning agent leaves 'on_hold' by reacting to this task transition (see AgentBrain). */
  approveTask: (taskId: string) => void
  rejectTask: (taskId: string, comments: string) => void

  addLogEntry: (entry: Omit<ActionLogEntry, "id" | "timestamp">) => void
  addRequestLog: (entry: Omit<RequestDebugLogEntry, "id" | "timestamp" | "phase">) => void
  addResponseLog: (entry: Omit<ResponseDebugLogEntry, "id" | "timestamp" | "phase">) => void

  appendAgentMessage: (agentIndex: number, message: AgentMessage) => void

  /** Counts one model call against the run's budget; separate from debug logging on purpose. */
  recordModelCall: () => void
  recordIntentAttempt: (key: string, error?: string) => void
  clearIntentAttempts: (key: string) => void
  pauseAutonomy: (pause: AutonomyPause) => void
  resumeAutonomy: () => void

  setLogFilter: (agentIndex: number | null) => void
  setFinalOutputOpen: (open: boolean) => void
  setIsResizing: (isResizing: boolean) => void
  setViewMode: (mode: "simulation" | "design") => void
}

type ProjectFields = Pick<
  CoreState,
  | "userBrief"
  | "phase"
  | "finalOutput"
  | "finalizedAt"
  | "tasks"
  | "actionLog"
  | "debugLog"
  | "agentHistories"
  | "isFinalOutputOpen"
  | "totalTokenUsage"
  | "agentTokenUsage"
  | "totalEstimatedCost"
  | "agentEstimatedCost"
  | "isReviewingOutput"
  | "pendingOutputPrompt"
  | "autonomyPause"
  | "intentAttempts"
  | "llmCallCount"
  | "llmCallLimit"
>

function uniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function appendCapped<T>(list: readonly T[], item: T, maxLength: number): T[] {
  return list.length >= maxLength
    ? [...list.slice(list.length - maxLength + 1), item]
    : [...list, item]
}

function addUsage(total: Usage, added: Usage): Usage {
  return {
    inputTokens: total.inputTokens + added.inputTokens,
    outputTokens: total.outputTokens + added.outputTokens,
    cacheReadTokens: total.cacheReadTokens + added.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + added.cacheWriteTokens,
  }
}

function patchTask(tasks: Task[], taskId: string, patch: (task: Task) => Partial<Task>): Task[] {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, ...patch(task), updatedAt: Date.now() } : task,
  )
}

function initialProject(): ProjectFields {
  return {
    userBrief: "",
    phase: "idle",
    finalOutput: null,
    finalizedAt: null,
    tasks: [],
    actionLog: [],
    debugLog: [],
    agentHistories: {},
    isFinalOutputOpen: false,
    totalTokenUsage: EMPTY_USAGE,
    agentTokenUsage: {},
    totalEstimatedCost: 0,
    agentEstimatedCost: {},
    isReviewingOutput: false,
    pendingOutputPrompt: "",
    autonomyPause: null,
    intentAttempts: {},
    llmCallCount: 0,
    llmCallLimit: LLM_CALL_BUDGET,
  }
}

/**
 * Project state for the active team. Returning the current state from an updater makes it a
 * no-op that does not notify subscribers.
 */
export const useCoreStore = create<CoreState>()((set) => ({
  runId: 0,
  ...initialProject(),
  logFilterAgentIndex: null,
  isResizing: false,
  viewMode: "simulation",

  setViewMode: (viewMode) => set({ viewMode }),

  resetProject: () => set((state) => ({ ...initialProject(), runId: state.runId + 1 })),

  startProject: (brief) => set({ userBrief: brief, phase: "working" }),
  setReviewingOutput: (isReviewing) => set({ isReviewingOutput: isReviewing }),
  setPendingOutputPrompt: (prompt) => set({ pendingOutputPrompt: prompt }),
  requestOutputReview: (output) => set({ pendingOutputPrompt: output, isReviewingOutput: true }),
  finalizeOutput: (output) =>
    set({
      isReviewingOutput: false,
      pendingOutputPrompt: "",
      finalOutput: output,
      finalizedAt: Date.now(),
      phase: "done",
      isFinalOutputOpen: true,
    }),

  addTask: (task) => {
    const now = Date.now()
    const newTask: Task = {
      ...task,
      id: `task_${uniqueId()}`,
      revisions: [],
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ tasks: [...state.tasks, newTask] }))
    return newTask
  },

  removeTask: (taskId) =>
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) })),

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId)
      if (!task || task.status === status) return state
      if (task.status === "done" && (status === "in_progress" || status === "on_hold")) return state
      return { tasks: patchTask(state.tasks, taskId, () => ({ status })) }
    }),

  submitTaskForReview: (taskId, draftOutput) =>
    set((state) => ({
      tasks: patchTask(state.tasks, taskId, () => ({
        status: "on_hold",
        draftOutput,
        error: undefined,
      })),
    })),

  completeTask: (taskId, output) =>
    set((state) => ({
      tasks: patchTask(state.tasks, taskId, () => ({ status: "done", output, error: undefined })),
    })),

  setTaskError: (taskId, error) =>
    set((state) =>
      state.tasks.some((task) => task.id === taskId)
        ? { tasks: patchTask(state.tasks, taskId, () => ({ error })) }
        : state,
    ),

  approveTask: (taskId) =>
    set((state) => ({
      tasks: patchTask(state.tasks, taskId, (task) => ({
        status: "done",
        output: task.draftOutput || task.output,
        revisions: task.draftOutput
          ? [...task.revisions, { output: task.draftOutput, timestamp: Date.now() }]
          : task.revisions,
        draftOutput: undefined,
      })),
    })),

  rejectTask: (taskId, comments) =>
    set((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId)
      if (!task) return state
      const history = state.agentHistories[task.assignedAgentId] ?? []
      return {
        tasks: patchTask(state.tasks, taskId, (rejected) => ({
          status: "scheduled",
          reviewComments: comments,
          revisions: rejected.draftOutput
            ? [
                ...rejected.revisions,
                { output: rejected.draftOutput, feedback: comments, timestamp: Date.now() },
              ]
            : rejected.revisions,
          draftOutput: undefined,
        })),
        agentHistories: {
          ...state.agentHistories,
          [task.assignedAgentId]: appendToHistory(
            history,
            { role: "user", content: [{ type: "text", text: `Rejected. Reason: ${comments}` }] },
            MAX_HISTORY_PER_AGENT,
          ),
        },
      }
    }),

  addLogEntry: (entry) =>
    set((state) => ({
      actionLog: appendCapped(
        state.actionLog,
        { ...entry, id: `log_${uniqueId()}`, timestamp: Date.now() },
        MAX_ACTION_LOG,
      ),
    })),

  addRequestLog: (entry) =>
    set((state) => ({
      debugLog: appendCapped(
        state.debugLog,
        { ...entry, id: `debug_${uniqueId()}`, timestamp: Date.now(), phase: "request" },
        MAX_DEBUG_LOG,
      ),
    })),

  addResponseLog: (entry) =>
    set((state) => {
      const debugLog = appendCapped<DebugLogEntry>(
        state.debugLog,
        { ...entry, id: `debug_${uniqueId()}`, timestamp: Date.now(), phase: "response" },
        MAX_DEBUG_LOG,
      )
      const pricedModel = findModel(entry.raw.servedBy.model) ?? findModel(entry.raw.model)
      const callCost = pricedModel ? costOfUsage(pricedModel, entry.usage) : 0
      return {
        debugLog,
        totalTokenUsage: addUsage(state.totalTokenUsage, entry.usage),
        agentTokenUsage: {
          ...state.agentTokenUsage,
          [entry.agentIndex]: addUsage(
            state.agentTokenUsage[entry.agentIndex] ?? EMPTY_USAGE,
            entry.usage,
          ),
        },
        totalEstimatedCost: state.totalEstimatedCost + callCost,
        agentEstimatedCost: {
          ...state.agentEstimatedCost,
          [entry.agentIndex]: (state.agentEstimatedCost[entry.agentIndex] ?? 0) + callCost,
        },
      }
    }),

  appendAgentMessage: (agentIndex, message) =>
    set((state) => ({
      agentHistories: {
        ...state.agentHistories,
        [agentIndex]: appendToHistory(
          state.agentHistories[agentIndex] ?? [],
          message,
          MAX_HISTORY_PER_AGENT,
        ),
      },
    })),

  recordModelCall: () => set((state) => ({ llmCallCount: state.llmCallCount + 1 })),

  recordIntentAttempt: (key, error) =>
    set((state) => ({
      intentAttempts: {
        ...state.intentAttempts,
        [key]: {
          count: (state.intentAttempts[key]?.count ?? 0) + 1,
          lastAttemptAt: Date.now(),
          lastError: error,
        },
      },
    })),

  clearIntentAttempts: (key) =>
    set((state) => {
      if (!(key in state.intentAttempts)) return state
      const intentAttempts = { ...state.intentAttempts }
      delete intentAttempts[key]
      return { intentAttempts }
    }),

  pauseAutonomy: (pause) =>
    set((state) => (state.autonomyPause ? state : { autonomyPause: pause })),

  resumeAutonomy: () =>
    set((state) => ({
      autonomyPause: null,
      intentAttempts: {},
      llmCallLimit:
        state.autonomyPause?.kind === "budget"
          ? state.llmCallCount + LLM_CALL_BUDGET
          : state.llmCallLimit,
    })),

  setLogFilter: (agentIndex) => set({ logFilterAgentIndex: agentIndex }),
  setFinalOutputOpen: (open) => set({ isFinalOutputOpen: open }),
  setIsResizing: (isResizing) => set({ isResizing }),
}))

// TODO(#16): reset on team change without a module-level cross-store subscription.
useTeamStore.subscribe((state, previousState) => {
  if (state.selectedAgentSetId !== previousState.selectedAgentSetId) {
    useCoreStore.getState().resetProject()
  }
})
