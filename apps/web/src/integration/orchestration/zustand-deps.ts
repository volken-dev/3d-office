import type {
  OrchestrationDeps,
  ProjectSnapshot,
  ProjectStatePort,
} from "@the-delegation/agents/orchestration/ports"
import type { AutonomyPause } from "@the-delegation/agents/project/types"
import { toast } from "sonner"
import { createGatewayClient } from "../llm/gatewayClient"
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

let closeChatTimer: ReturnType<typeof setTimeout> | undefined

const events: OrchestrationDeps["events"] = {
  llmError({ agent, kind, message }) {
    if (kind === "unavailable" || kind === "not_configured") {
      void useUiStore.getState().checkGateway()
    }
    const title =
      kind === "rate_limited"
        ? "The model provider is rate limiting requests"
        : kind === "not_configured"
          ? "The model gateway is not available"
          : `${agent.name} hit an error`
    toast.error(title, { id: `llm-error-${agent.index}`, description: message.slice(0, 240) })
  },

  autonomyPaused(pause: AutonomyPause) {
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
  recordModelCall: () => useCoreStore.getState().recordModelCall(),
  getIntentAttempts: (key) => useCoreStore.getState().intentAttempts[key],
  recordIntentAttempt: (key, error) => useCoreStore.getState().recordIntentAttempt(key, error),
  clearIntentAttempts: (key) => useCoreStore.getState().clearIntentAttempts(key),
  pauseAutonomy: (pause) => {
    if (useCoreStore.getState().autonomyPause) return
    useCoreStore.getState().pauseAutonomy(pause)
    events.autonomyPaused(pause)
  },
}

const gatewayClient = createGatewayClient()

/** Wires agent orchestration to the Zustand stores, the model gateway and Sonner toasts. */
export const zustandOrchestrationDeps: OrchestrationDeps = {
  project,
  team: { getTeam: getActiveAgentSet },
  createLLMClient: () => gatewayClient,
  events,
}
