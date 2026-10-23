import type { MessagesRequest } from "@the-delegation/shared/llm-messages"
import { type LLMError, toLLMError } from "../llm/errors"
import { LLM_TIMEOUT_MS } from "../orchestration/policy"
import type { OrchestrationDeps } from "../orchestration/ports"
import type { AgentWorkStatus } from "../project/types"
import type { AgentNode } from "../team"
import { lastContextText, toolCallsIn, toRequestMessages } from "./history"
import { buildContextText, buildSystemPrompt } from "./PromptBuilder"
import { answerToolCalls, getToolDefinitions } from "./ToolRegistry"

/** What starts a turn: the user's chat message (shown in the chat) or an autonomous prompt (internal). */
export type TurnTrigger = { kind: "chat"; text: string } | { kind: "intent"; prompt: string }

export type TurnOutcome =
  | { status: "completed" }
  | { status: "skipped" }
  | { status: "failed"; error: LLMError }

export const SKIPPED: TurnOutcome = Object.freeze({ status: "skipped" })
const COMPLETED: TurnOutcome = Object.freeze({ status: "completed" })

export interface ModelTurn {
  agent: AgentNode
  trigger: TurnTrigger
  /** The run this turn belongs to; once the project is reset the turn is skipped or discarded. */
  runId: number
  taskId: string | undefined
  signal: AbortSignal
  setStatus(status: AgentWorkStatus): void
}

/**
 * One request to the model, then its tool calls. History is append-only: the project context is
 * added as an internal turn only when it changed, the reply is stored exactly as returned, and every
 * tool call is answered in one user turn, so the next request is valid for Claude. A reply that
 * arrives after the call was aborted or the run was reset is discarded; failures are reported, never
 * thrown.
 */
export async function runModelTurn(
  dependencies: OrchestrationDeps,
  turn: ModelTurn,
): Promise<TurnOutcome> {
  const { project, team, events } = dependencies
  const { agent, trigger } = turn
  const isStale = () => turn.signal.aborted || project.snapshot().runId !== turn.runId
  if (isStale()) return SKIPPED

  try {
    const system = team.getTeam()
    const { phase, tasks } = project.snapshot()
    if (trigger.kind === "chat") {
      project.appendHistory(agent.index, {
        role: "user",
        content: [{ type: "text", text: trigger.text }],
      })
    }
    appendContextIfChanged(
      dependencies,
      agent.index,
      buildContextText(agent, phase, project.getBrief(), tasks, system),
    )
    if (trigger.kind === "intent") {
      project.appendHistory(agent.index, {
        role: "user",
        content: [{ type: "text", text: trigger.prompt }],
        metadata: { internal: true },
      })
    }

    const toolDefinitions = getToolDefinitions(agent, system, phase)
    const request: MessagesRequest = {
      model: agent.model,
      system: buildSystemPrompt(agent, system),
      messages: toRequestMessages(project.getHistory(agent.index)),
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
    }

    project.recordModelCall()
    project.logRequest({
      agentIndex: agent.index,
      agentName: agent.name,
      systemInstruction: request.system,
      contents: request.messages,
      systemTools: toolDefinitions,
      taskId: turn.taskId,
    })

    const response = await dependencies
      .createLLMClient()
      .complete(request, { signal: turn.signal, timeoutMs: LLM_TIMEOUT_MS })
    if (isStale()) return SKIPPED

    project.logResponse({
      agentIndex: agent.index,
      agentName: agent.name,
      content: response.content,
      usage: response.usage,
      raw: { model: agent.model, servedBy: response.servedBy, stopReason: response.stopReason },
      taskId: turn.taskId,
    })

    const replyMetadata = trigger.kind === "intent" ? { internal: true } : undefined
    if (response.content.length > 0) {
      project.appendHistory(agent.index, {
        role: "assistant",
        content: response.content,
        metadata: replyMetadata,
      })
    }

    const results = answerToolCalls(
      {
        agent,
        team: system,
        project,
        events,
        setStatus: turn.setStatus,
        appendHistory: (message) => project.appendHistory(agent.index, message),
      },
      toolCallsIn(response.content),
      response.stopReason,
      new Set(toolDefinitions.map((definition) => definition.name)),
    )
    if (results.length > 0) {
      project.appendHistory(agent.index, {
        role: "user",
        content: results,
        metadata: { internal: true },
      })
    }
    return COMPLETED
  } catch (caught) {
    const error = toLLMError(caught)
    if (error.kind === "aborted" || isStale()) return SKIPPED

    events.llmError({ agent, kind: error.kind, message: error.message, taskId: turn.taskId })
    if (trigger.kind === "chat") {
      project.appendHistory(agent.index, {
        role: "assistant",
        content: [{ type: "text", text: `Sorry, that request failed: ${error.message}` }],
        metadata: { error: true, displayOnly: true },
      })
    }
    return { status: "failed", error }
  }
}

/** Appends the project context as an internal turn, unless the latest snapshot in history is identical. */
function appendContextIfChanged(
  { project }: OrchestrationDeps,
  agentIndex: number,
  contextText: string,
): void {
  if (lastContextText(project.getHistory(agentIndex)) === contextText) return
  project.appendHistory(agentIndex, {
    role: "user",
    content: [{ type: "text", text: contextText }],
    metadata: { internal: true, context: true },
  })
}
