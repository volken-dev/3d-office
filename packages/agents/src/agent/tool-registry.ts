import type {
  StopReason,
  ToolCallBlock,
  ToolDefinition,
  ToolResultBlock,
} from "@the-delegation/shared/llm-messages"
import type { ProjectPhase } from "../project/types"
import type { AgenticSystem, AgentNode } from "../team"
import { completeTask } from "./tools/completeTask"
import { deliverProject } from "./tools/deliverProject"
import { proposeTask } from "./tools/proposeTask"
import { setUserBrief } from "./tools/setUserBrief"
import { parseToolArgs } from "./tools/toolArgs"
import { fail, type ToolContext, type ToolResult, type ToolSpec } from "./tools/types"

interface RegisteredTool {
  definition: ToolDefinition
  isOffered: ToolSpec<unknown>["isOffered"]
  execute(context: ToolContext, rawArgs: Record<string, unknown>): ToolResult
}

function register<A>(spec: ToolSpec<A>): RegisteredTool {
  return {
    definition: spec.definition,
    isOffered: spec.isOffered,
    execute(context, rawArgs) {
      const args = parseToolArgs(spec.args, rawArgs)
      return args.ok ? spec.run(context, args.value) : args
    },
  }
}

/** Every agent tool. Order matters: it is the order the model sees the tools in. */
const TOOLS: readonly RegisteredTool[] = [
  register(setUserBrief),
  register(proposeTask),
  register(completeTask),
  register(deliverProject),
]

const TOOLS_BY_NAME: ReadonlyMap<string, RegisteredTool> = new Map(
  TOOLS.map((tool) => [tool.definition.name, tool]),
)

/** Stop reasons whose tool calls may carry cut-off arguments, so they are answered without running. */
const TRUNCATING_STOP_REASONS: ReadonlySet<StopReason> = new Set(["max_tokens", "refusal"])

const TRUNCATED_CALL_ERROR =
  "Not run: your reply was cut off, so the arguments may be incomplete. Call the tool again."

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
  call: ToolCallBlock,
  offered: ReadonlySet<string>,
): ToolResult {
  const tool = TOOLS_BY_NAME.get(call.name)
  if (!tool || !offered.has(call.name))
    return fail(`Tool "${call.name}" is not available to you right now.`)
  return tool.execute(context, call.input)
}

/**
 * Answers every tool call in a model turn with exactly one result, in order, so the next request
 * keeps Claude's tool-use contract. Calls from a turn cut off by `max_tokens` or a refusal are
 * answered with an error instead of being run.
 */
export function answerToolCalls(
  context: ToolContext,
  calls: readonly ToolCallBlock[],
  stopReason: StopReason,
  offered: ReadonlySet<string>,
): ToolResultBlock[] {
  const truncated = TRUNCATING_STOP_REASONS.has(stopReason)
  return calls.map((call): ToolResultBlock => {
    const result = truncated ? fail(TRUNCATED_CALL_ERROR) : runToolCall(context, call, offered)
    return {
      type: "tool_result",
      toolCallId: call.id,
      content: result.ok ? result.summary : result.error,
      isError: !result.ok,
    }
  })
}
