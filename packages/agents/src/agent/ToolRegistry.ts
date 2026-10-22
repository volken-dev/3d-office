import type { ToolCallBlock, ToolDefinition } from "@the-delegation/shared/llm-messages"
import type { ProjectPhase } from "../project/types"
import type { AgenticSystem, AgentNode } from "../team"
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
  definition: ToolDefinition
  isOffered: ToolSpec<unknown>["isOffered"]
  execute(context: ToolContext, rawArgs: Record<string, unknown>): ToolResult
}

function register<A>(spec: ToolSpec<A>): RegisteredTool {
  return {
    name: spec.definition.name,
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

/** A tool call block as the registry runs it. The gateway already parsed `input` into an object. */
export function parseToolCall(call: ToolCallBlock): ParsedToolCall {
  return { name: call.name, args: call.input }
}

/** The tools offered to this agent in this phase; only these may run for the request they are sent with. */
export function getToolDefinitions(
  agent: AgentNode,
  team: AgenticSystem,
  phase: ProjectPhase,
): ToolDefinition[] {
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
