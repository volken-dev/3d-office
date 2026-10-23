import type { ToolDefinition } from "@the-delegation/shared/llm-messages"
import type { z } from "zod"
import type { AgentMessage } from "../../llm/types"
import type {
  ActivityLogPort,
  OrchestratorEvents,
  ProjectReader,
  TaskBoardPort,
} from "../../orchestration/ports"
import type { AgentWorkStatus, ProjectPhase } from "../../project/types"
import type { AgenticSystem, AgentNode } from "../../team"

/** The project surface a tool may touch: read the board, make board transitions, log actions. */
export type ToolProject = ProjectReader & TaskBoardPort & Pick<ActivityLogPort, "logAction">

export interface ToolContext {
  agent: AgentNode
  team: AgenticSystem
  project: ToolProject
  events: Pick<OrchestratorEvents, "briefSet">
  setStatus(status: AgentWorkStatus): void
  appendHistory(message: AgentMessage): void
}

/** `summary` is returned to the model as the tool result, so it can rely on what happened (e.g. a new task id). */
export type ToolResult = { ok: true; summary: string } | ToolFailure

export type ArgsResult<A> = { ok: true; value: A } | ToolFailure

export interface ToolSpec<A> {
  /** Sent to the model; its input schema is derived from `args`, so the two cannot drift. */
  definition: ToolDefinition
  /** Validates every argument, length caps included; extra keys are rejected. */
  args: z.ZodType<A>
  /** Whether this agent is offered the tool in this phase; calls to tools that were not offered are rejected. */
  isOffered(agent: AgentNode, team: AgenticSystem, phase: ProjectPhase): boolean
  run(context: ToolContext, args: A): ToolResult
}

export type ToolFailure = { ok: false; error: string }

/** Builds the failure a tool returns to the model instead of throwing, so the model can correct itself. */
export function fail(error: string): ToolFailure {
  return { ok: false, error }
}
