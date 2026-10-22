import type { AgenticSystem, AgentNode } from "../../data/agents"
import type { LLMErrorKind } from "../llm/errors"
import type { LLMClient, LLMConfig, LLMMessage } from "../llm/types"
import type {
  ActionLogEntry,
  AutonomyPause,
  IntentAttempts,
  NewTask,
  ProjectPhase,
  RequestDebugLogEntry,
  ResponseDebugLogEntry,
  Task,
} from "../project/types"

/** The parts of project state the orchestration reacts to. */
export interface ProjectSnapshot {
  runId: number
  phase: ProjectPhase
  tasks: readonly Task[]
  autonomyPause: AutonomyPause | null
}

export interface ProjectStatePort {
  snapshot(): ProjectSnapshot
  subscribe(listener: (next: ProjectSnapshot, previous: ProjectSnapshot) => void): () => void

  getBrief(): string
  getTask(taskId: string): Task | undefined
  isAwaitingOutputReview(): boolean

  getHistory(agentIndex: number): readonly LLMMessage[]
  /** Append-only, so concurrent writers (chat, review feedback, the agent itself) never overwrite each other. */
  appendHistory(agentIndex: number, message: LLMMessage): void

  startProject(brief: string): void
  addTask(task: NewTask): Task
  setTaskError(taskId: string, error: string | undefined): void
  submitTaskForReview(taskId: string, draftOutput: string): void
  completeTask(taskId: string, output: string): void
  /** Hands the deliverable to the user for review, keeping the project in 'working'. */
  requestOutputReview(output: string): void
  finalizeOutput(output: string): void

  logAction(entry: Omit<ActionLogEntry, "id" | "timestamp">): void
  logRequest(entry: Omit<RequestDebugLogEntry, "id" | "timestamp" | "phase">): void
  logResponse(entry: Omit<ResponseDebugLogEntry, "id" | "timestamp" | "phase">): void

  /** Number of LLM calls made in this run and the current ceiling before autonomy pauses. */
  getCallBudget(): { used: number; limit: number }
  getIntentAttempts(key: string): IntentAttempts | undefined
  recordIntentAttempt(key: string, error?: string): void
  clearIntentAttempts(key: string): void
  pauseAutonomy(pause: AutonomyPause): void
}

export interface TeamPort {
  getTeam(): AgenticSystem
}

export interface SettingsPort {
  getLlmConfig(): LLMConfig
}

export interface LLMErrorEvent {
  agent: AgentNode
  kind: LLMErrorKind
  message: string
  taskId?: string
}

/** Side effects the UI decides how to present. */
export interface OrchestratorEvents {
  llmError(event: LLMErrorEvent): void
  autonomyPaused(pause: AutonomyPause): void
  briefSet(agentIndex: number): void
}

/**
 * Ports that agent orchestration depends on. The browser wires them to Zustand
 * (src/integration/orchestration); a server runtime can wire them to a database
 * and the Hono API without touching src/core.
 */
export interface OrchestrationDeps {
  project: ProjectStatePort
  team: TeamPort
  settings: SettingsPort
  createLLMClient(apiKey: string): LLMClient
  events: OrchestratorEvents
}
