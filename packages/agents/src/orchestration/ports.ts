import type { LLMErrorKind } from "../llm/errors"
import type { AgentMessage, LLMClient } from "../llm/types"
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
import type { AgenticSystem, AgentNode } from "../team"

/** The parts of project state the orchestration reacts to. */
export interface ProjectSnapshot {
  runId: number
  phase: ProjectPhase
  tasks: readonly Task[]
  autonomyPause: AutonomyPause | null
}

/** Read-only view of the project, and change notifications for it. */
export interface ProjectReader {
  snapshot(): ProjectSnapshot
  subscribe(listener: (next: ProjectSnapshot, previous: ProjectSnapshot) => void): () => void
  getBrief(): string
  getTask(taskId: string): Task | undefined
  isAwaitingOutputReview(): boolean
}

/** Each agent's conversation, owned by the store. */
export interface AgentHistoryPort {
  getHistory(agentIndex: number): readonly AgentMessage[]
  /** Append-only, so concurrent writers (chat, review feedback, the agent itself) never overwrite each other. */
  appendHistory(agentIndex: number, message: AgentMessage): void
}

/** The project transitions that agent tools are allowed to make. */
export interface TaskBoardPort {
  startProject(brief: string): void
  addTask(task: NewTask): Task
  setTaskError(taskId: string, error: string | undefined): void
  submitTaskForReview(taskId: string, draftOutput: string): void
  completeTask(taskId: string, output: string): void
  /** Hands the deliverable to the user for review, keeping the project in 'working'. */
  requestOutputReview(output: string): void
  finalizeOutput(output: string): void
}

/** The user-visible action log and the request/response debug log. Logging never affects spend. */
export interface ActivityLogPort {
  logAction(entry: Omit<ActionLogEntry, "id" | "timestamp">): void
  logRequest(entry: Omit<RequestDebugLogEntry, "id" | "timestamp" | "phase">): void
  logResponse(entry: Omit<ResponseDebugLogEntry, "id" | "timestamp" | "phase">): void
}

/** What the retry/budget policy in AgentBrain reads and records. */
export interface AutonomyBudgetPort {
  /** Number of LLM calls made in this run and the current ceiling before autonomy pauses. */
  getCallBudget(): { used: number; limit: number }
  /** Counts one model call against the run's budget; called once per request, before it is sent. */
  recordModelCall(): void
  getIntentAttempts(key: string): IntentAttempts | undefined
  recordIntentAttempt(key: string, error?: string): void
  clearIntentAttempts(key: string): void
  pauseAutonomy(pause: AutonomyPause): void
}

/** Everything the orchestration needs from project state; adapters implement it whole. */
export interface ProjectStatePort
  extends ProjectReader,
    AgentHistoryPort,
    TaskBoardPort,
    ActivityLogPort,
    AutonomyBudgetPort {}

export interface TeamPort {
  getTeam(): AgenticSystem
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
 * (`apps/web/src/integration/orchestration`); a server runtime can wire them to a database and the
 * Hono API without touching this package.
 */
export interface OrchestrationDeps {
  project: ProjectStatePort
  team: TeamPort
  createLLMClient(): LLMClient
  events: OrchestratorEvents
}
