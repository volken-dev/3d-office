import type { LLMMessage, LLMTokenUsage, LLMToolCall, LLMToolDefinition } from "../llm/types"

export type ProjectPhase = "idle" | "working" | "done"

export type TaskStatus = "scheduled" | "on_hold" | "in_progress" | "done"

export interface TaskRevision {
  output: string
  feedback?: string
  timestamp: number
}

export interface Task {
  id: string
  title: string
  description: string
  assignedAgentId: number
  status: TaskStatus
  parentTaskId?: string
  requiresUserApproval: boolean
  draftOutput?: string
  reviewComments?: string
  output?: string
  /** Last LLM failure while working on this task; cleared when the task completes. */
  error?: string
  revisions: TaskRevision[]
  createdAt: number
  updatedAt: number
}

export type NewTask = Omit<Task, "id" | "revisions" | "createdAt" | "updatedAt">

export interface ActionLogEntry {
  id: string
  timestamp: number
  agentIndex: number
  action: string
  taskId?: string
}

interface DebugLogEntryBase {
  id: string
  timestamp: number
  agentIndex: number
  agentName: string
  taskId?: string
}

export interface RequestDebugLogEntry extends DebugLogEntryBase {
  phase: "request"
  systemInstruction?: string
  contents: LLMMessage[]
  systemTools?: LLMToolDefinition[]
}

/** Small summary of the provider response; the full SDK payload is deliberately not retained. */
export interface ResponseSummary {
  model: string
  modelVersion?: string
  responseId?: string
  finishReason?: string
}

export interface ResponseDebugLogEntry extends DebugLogEntryBase {
  phase: "response"
  content: string | null
  tool_calls?: LLMToolCall[]
  usage?: LLMTokenUsage
  raw?: ResponseSummary
}

export type DebugLogEntry = RequestDebugLogEntry | ResponseDebugLogEntry

/** Why autonomous agent work stopped and needs the user to resume it. */
export interface AutonomyPause {
  reason: string
  kind: "budget" | "failures" | "quota" | "auth"
  taskId?: string
  agentIndex?: number
}

/** Consecutive autonomous attempts for one intent (a task id, 'spark' or 'conclude') that did not make progress. */
export interface IntentAttempts {
  count: number
  lastAttemptAt: number
  lastError?: string
}
