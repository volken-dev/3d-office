import type { AgenticSystem, AgentNode } from "../../../data/agents"
import type { AgentWorkStatus } from "../../../types"
import type { LLMMessage, LLMToolDefinition } from "../../llm/types"
import type { ProjectStatePort } from "../../orchestration/ports"
import type { ProjectPhase } from "../../project/types"

export interface ToolContext {
  agent: AgentNode
  team: AgenticSystem
  project: ProjectStatePort
  setStatus(status: AgentWorkStatus): void
  appendHistory(message: LLMMessage): void
}

export type ToolResult = { ok: true } | ToolFailure

export type ArgsResult<A> = { ok: true; value: A } | ToolFailure

export interface ToolSpec<A> {
  definition: LLMToolDefinition
  /** Whether this agent is offered the tool in this phase; calls to tools that were not offered are rejected. */
  isOffered(agent: AgentNode, team: AgenticSystem, phase: ProjectPhase): boolean
  parseArgs(raw: Record<string, unknown>): ArgsResult<A>
  run(context: ToolContext, args: A): ToolResult
}

export type ToolFailure = { ok: false; error: string }

/** Builds the failure a tool returns to the model instead of throwing, so the model can correct itself. */
export function fail(error: string): ToolFailure {
  return { ok: false, error }
}

/** Reads a required string argument, trimmed and length-capped. */
export function readString(
  raw: Record<string, unknown>,
  key: string,
  maxLength: number,
): ArgsResult<string> {
  const value = raw[key]
  if (typeof value !== "string" || value.trim() === "")
    return fail(`"${key}" must be a non-empty string.`)
  if (value.length > maxLength)
    return fail(`"${key}" is too long (${value.length} characters, max ${maxLength}).`)
  return { ok: true, value: value.trim() }
}
