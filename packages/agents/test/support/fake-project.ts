import { appendToHistory } from "../../src/agent/history"
import type { AgentMessage } from "../../src/llm/types"
import { LLM_CALL_BUDGET, MAX_HISTORY_PER_AGENT } from "../../src/orchestration/policy"
import type { ProjectSnapshot, ProjectStatePort } from "../../src/orchestration/ports"
import type {
  ActionLogEntry,
  AutonomyPause,
  IntentAttempts,
  NewTask,
  RequestDebugLogEntry,
  ResponseDebugLogEntry,
  Task,
} from "../../src/project/types"

/** In-memory `ProjectStatePort` with the same observable behaviour as the Zustand adapter. */
export class FakeProject implements ProjectStatePort {
  private state: ProjectSnapshot = { runId: 1, phase: "idle", tasks: [], autonomyPause: null }
  private readonly listeners = new Set<(next: ProjectSnapshot, previous: ProjectSnapshot) => void>()
  private nextTaskNumber = 1
  brief = ""
  finalOutput: string | null = null
  outputUnderReview: string | null = null
  callsUsed = 0
  callLimit = LLM_CALL_BUDGET
  readonly histories = new Map<number, AgentMessage[]>()
  readonly intentAttempts = new Map<string, IntentAttempts>()
  readonly actions: Omit<ActionLogEntry, "id" | "timestamp">[] = []
  readonly requests: Omit<RequestDebugLogEntry, "id" | "timestamp" | "phase">[] = []
  readonly responses: Omit<ResponseDebugLogEntry, "id" | "timestamp" | "phase">[] = []
  readonly pauses: AutonomyPause[] = []

  snapshot(): ProjectSnapshot {
    return this.state
  }

  subscribe(listener: (next: ProjectSnapshot, previous: ProjectSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Replaces part of the snapshot and notifies subscribers, like a store `set()`. */
  update(changes: Partial<ProjectSnapshot>): void {
    const previous = this.state
    this.state = { ...previous, ...changes }
    for (const listener of [...this.listeners]) listener(this.state, previous)
  }

  getBrief(): string {
    return this.brief
  }

  getTask(taskId: string): Task | undefined {
    return this.state.tasks.find((task) => task.id === taskId)
  }

  isAwaitingOutputReview(): boolean {
    return this.outputUnderReview !== null
  }

  getHistory(agentIndex: number): readonly AgentMessage[] {
    return this.histories.get(agentIndex) ?? []
  }

  appendHistory(agentIndex: number, message: AgentMessage): void {
    this.histories.set(
      agentIndex,
      appendToHistory(this.getHistory(agentIndex), message, MAX_HISTORY_PER_AGENT),
    )
  }

  startProject(brief: string): void {
    this.brief = brief
    this.update({ phase: "working" })
  }

  addTask(newTask: NewTask): Task {
    const now = Date.now()
    const task: Task = {
      ...newTask,
      id: `task-${this.nextTaskNumber++}`,
      revisions: [],
      createdAt: now,
      updatedAt: now,
    }
    this.update({ tasks: [...this.state.tasks, task] })
    return task
  }

  startTask(taskId: string): void {
    this.patchTask(taskId, { status: "in_progress" })
  }

  setTaskError(taskId: string, error: string | undefined): void {
    this.patchTask(taskId, { error })
  }

  submitTaskForReview(taskId: string, draftOutput: string): void {
    this.patchTask(taskId, { status: "on_hold", draftOutput })
  }

  completeTask(taskId: string, output: string): void {
    this.patchTask(taskId, { status: "done", output, error: undefined })
  }

  requestOutputReview(output: string): void {
    this.outputUnderReview = output
  }

  finalizeOutput(output: string): void {
    this.outputUnderReview = null
    this.finalOutput = output
    this.update({ phase: "done" })
  }

  logAction(entry: Omit<ActionLogEntry, "id" | "timestamp">): void {
    this.actions.push(entry)
  }

  logRequest(entry: Omit<RequestDebugLogEntry, "id" | "timestamp" | "phase">): void {
    this.requests.push(entry)
  }

  logResponse(entry: Omit<ResponseDebugLogEntry, "id" | "timestamp" | "phase">): void {
    this.responses.push(entry)
  }

  getCallBudget(): { used: number; limit: number } {
    return { used: this.callsUsed, limit: this.callLimit }
  }

  recordModelCall(): void {
    this.callsUsed++
  }

  getIntentAttempts(key: string): IntentAttempts | undefined {
    return this.intentAttempts.get(key)
  }

  recordIntentAttempt(key: string, error?: string): void {
    const previous = this.intentAttempts.get(key)
    this.intentAttempts.set(key, {
      count: (previous?.count ?? 0) + 1,
      lastAttemptAt: Date.now(),
      lastError: error,
    })
  }

  clearIntentAttempts(key: string): void {
    this.intentAttempts.delete(key)
  }

  pauseAutonomy(pause: AutonomyPause): void {
    this.pauses.push(pause)
    this.update({ autonomyPause: pause })
  }

  private patchTask(taskId: string, changes: Partial<Task>): void {
    this.update({
      tasks: this.state.tasks.map((task) =>
        task.id === taskId ? { ...task, ...changes, updatedAt: Date.now() } : task,
      ),
    })
  }
}
