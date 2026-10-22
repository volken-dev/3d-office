import type { AgenticSystem, AgentNode } from "../../data/agents"
import type { LLMToolCall, LLMToolDefinition } from "../llm/types"
import type { ProjectPhase } from "../project/types"
import { completeTask } from "./tools/completeTask"
import { deliverProject } from "./tools/deliverProject"
import { proposeTask } from "./tools/proposeTask"
import { setUserBrief } from "./tools/setUserBrief"
import { fail, type ToolContext, type ToolResult, type ToolSpec } from "./tools/types"

/** A tool call with its JSON arguments parsed into an object. */
export interface ParsedToolCall {
  name: string
  args: Record<string, unknown>
}

interface RegisteredTool {
  name: string
  definition: LLMToolDefinition
  isOffered: ToolSpec<unknown>["isOffered"]
  execute(context: ToolContext, rawArgs: Record<string, unknown>): ToolResult
}

function register<A>(spec: ToolSpec<A>): RegisteredTool {
  return {
    name: spec.definition.function.name,
    definition: spec.definition,
    isOffered: spec.isOffered,
    execute(context, rawArgs) {
      const args = spec.parseArgs(rawArgs)
      return args.ok ? spec.run(context, args.value) : args
    },
  }
}

/** Every agent tool. Order matters: it is the order the model sees the tools in. */
const TOOLS: RegisteredTool[] = [
  register(setUserBrief),
  register(proposeTask),
  register(completeTask),
  register(deliverProject),
]

/**
 * Parses a tool call's JSON arguments. Unparseable or non-object arguments become an empty object,
 * which each tool's `parseArgs` then rejects with a precise error for the model.
 */
export function parseToolCall(call: LLMToolCall): ParsedToolCall {
  let args: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(call.function.arguments)
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      args = value as Record<string, unknown>
  } catch {}
  return { name: call.function.name, args }
}

/** The tools offered to this agent in this phase; only these may run for the request they are sent with. */
export function getToolDefinitions(
  agent: AgentNode,
  team: AgenticSystem,
  phase: ProjectPhase,
): LLMToolDefinition[] {
  return TOOLS.filter((tool) => tool.isOffered(agent, team, phase)).map((tool) => tool.definition)
}

/**
 * Validates and runs one tool call. `offered` is the set of tool names sent with the request,
 * so a model cannot call a tool it was not given for this agent and phase.
 */
export function runToolCall(
  context: ToolContext,
  call: ParsedToolCall,
  offered: ReadonlySet<string>,
): ToolResult {
  const tool = TOOLS.find((candidate) => candidate.name === call.name)
  if (!tool || !offered.has(call.name))
    return fail(`Tool "${call.name}" is not available to you right now.`)
  return tool.execute(context, call.args)
}
