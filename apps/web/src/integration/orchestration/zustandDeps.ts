import { toast } from "sonner"
import { GeminiProvider } from "../../core/llm/providers/GeminiProvider"
import type { LLMClient } from "../../core/llm/types"
import type {
  OrchestrationDeps,
  ProjectSnapshot,
  ProjectStatePort,
} from "../../core/orchestration/ports"
import type { AutonomyPause } from "../../core/project/types"
import { useCoreStore } from "../store/coreStore"
import { getActiveAgentSet } from "../store/teamStore"
import { useUiStore } from "../store/uiStore"

/** Delay before the lead's chat closes after the brief is set; the project's first planning turn waits for it. */
const CLOSE_CHAT_AFTER_BRIEF_MS = 3_000
const PAUSE_TOAST_ID = "autonomy-paused"

type CoreState = ReturnType<typeof useCoreStore.getState>

function toSnapshot(state: CoreState): ProjectSnapshot {
  return {
    runId: state.runId,
    phase: state.phase,
    tasks: state.tasks,
    autonomyPause: state.autonomyPause,
  }
}

/** Resumes automatically once the user saves a different key after an auth failure. */
function resumeWhenKeyChanges() {
  const keyAtPause = useUiStore.getState().llmConfig.apiKey
  const unsubscribe = useUiStore.subscribe((state) => {
    if (state.llmConfig.apiKey === keyAtPause) return
    unsubscribe()
    if (state.llmConfig.apiKey && useCoreStore.getState().autonomyPause?.kind === "auth") {
      useCoreStore.getState().resumeAutonomy()
      toast.dismiss(PAUSE_TOAST_ID)
    }
  })
}

let closeChatTimer: ReturnType<typeof setTimeout> | undefined

const events: OrchestrationDeps["events"] = {
  llmError({ agent, kind, message }) {
    if (kind === "auth" || kind === "missing_key") {
      useUiStore.getState().setBYOKOpen(true, message)
      return
    }
    const title =
      kind === "quota" ? "Gemini quota or rate limit reached" : `${agent.name} hit an error`
    toast.error(title, { id: `llm-error-${agent.index}`, description: message.slice(0, 240) })
  },

  autonomyPaused(pause: AutonomyPause) {
    if (pause.kind === "auth") resumeWhenKeyChanges()
    toast.warning("Agents paused", {
      id: PAUSE_TOAST_ID,
      description: pause.reason,
      duration: Infinity,
      action: { label: "Resume", onClick: () => useCoreStore.getState().resumeAutonomy() },
    })
  },

  briefSet() {
    clearTimeout(closeChatTimer)
    closeChatTimer = setTimeout(() => {
      const uiState = useUiStore.getState()
      if (uiState.isChatting) uiState.setChatting(false)
      uiState.setSelectedNpc(null)
    }, CLOSE_CHAT_AFTER_BRIEF_MS)
  },
}

const project: ProjectStatePort = {
  snapshot: () => toSnapshot(useCoreStore.getState()),
  subscribe: (listener) =>
    useCoreStore.subscribe((state, previousState) => {
      if (
        state.runId !== previousState.runId ||
        state.tasks !== previousState.tasks ||
        state.phase !== previousState.phase ||
        state.autonomyPause !== previousState.autonomyPause
      ) {
        listener(toSnapshot(state), toSnapshot(previousState))
      }
    }),

  getBrief: () => useCoreStore.getState().userBrief,
  getTask: (taskId) => useCoreStore.getState().tasks.find((task) => task.id === taskId),
  isAwaitingOutputReview: () => {
    const { isReviewingOutput, pendingOutputPrompt } = useCoreStore.getState()
    const isDeferredForLaterReview = pendingOutputPrompt !== ""
    return isReviewingOutput || isDeferredForLaterReview
  },

  getHistory: (agentIndex) => useCoreStore.getState().agentHistories[agentIndex] ?? [],
  appendHistory: (agentIndex, message) =>
    useCoreStore.getState().appendAgentMessage(agentIndex, message),

  startProject: (brief) => useCoreStore.getState().startProject(brief),
  addTask: (task) => useCoreStore.getState().addTask(task),
  setTaskError: (taskId, error) => useCoreStore.getState().setTaskError(taskId, error),
  submitTaskForReview: (taskId, draftOutput) =>
    useCoreStore.getState().submitTaskForReview(taskId, draftOutput),
  completeTask: (taskId, output) => useCoreStore.getState().completeTask(taskId, output),
  requestOutputReview: (output) => useCoreStore.getState().requestOutputReview(output),
  finalizeOutput: (output) => useCoreStore.getState().finalizeOutput(output),

  logAction: (entry) => useCoreStore.getState().addLogEntry(entry),
  logRequest: (entry) => useCoreStore.getState().addRequestLog(entry),
  logResponse: (entry) => useCoreStore.getState().addResponseLog(entry),

  getCallBudget: () => {
    const { llmCallCount, llmCallLimit } = useCoreStore.getState()
    return { used: llmCallCount, limit: llmCallLimit }
  },
  getIntentAttempts: (key) => useCoreStore.getState().intentAttempts[key],
  recordIntentAttempt: (key, error) => useCoreStore.getState().recordIntentAttempt(key, error),
  clearIntentAttempts: (key) => useCoreStore.getState().clearIntentAttempts(key),
  pauseAutonomy: (pause) => {
    if (useCoreStore.getState().autonomyPause) return
    useCoreStore.getState().pauseAutonomy(pause)
    events.autonomyPaused(pause)
  },
}

let cachedClient: { apiKey: string; client: LLMClient } | null = null

/** Wires agent orchestration to the Zustand stores, the browser Gemini SDK and Sonner toasts. */
export const zustandOrchestrationDeps: OrchestrationDeps = {
  project,
  team: { getTeam: getActiveAgentSet },
  settings: { getLlmConfig: () => useUiStore.getState().llmConfig },
  createLLMClient(apiKey) {
    if (cachedClient?.apiKey !== apiKey)
      cachedClient = { apiKey, client: new GeminiProvider(apiKey) }
    return cachedClient.client
  },
  events,
}
