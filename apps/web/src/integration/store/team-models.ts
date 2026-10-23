import type { AgenticSystem, AgentNode } from "@the-delegation/agents/team"
import {
  DEFAULT_LEAD_MODEL_ID,
  DEFAULT_TEAM_MODEL_ID,
  findModel,
} from "@the-delegation/llm/registry"

function withServedModel(node: AgentNode, fallbackModel: string): AgentNode {
  const subagents = node.subagents?.map((subagent) =>
    withServedModel(subagent, DEFAULT_TEAM_MODEL_ID),
  )
  const model = findModel(node.model) ? node.model : fallbackModel
  const subagentsChanged = subagents?.some(
    (subagent, index) => subagent !== node.subagents?.[index],
  )
  return model === node.model && !subagentsChanged ? node : { ...node, model, subagents }
}

/**
 * Replaces agent models the gateway does not serve (such as the Gemini ids saved by earlier versions) with the
 * defaults: Opus for the lead, Sonnet for everyone else. Returns the same object when nothing changed.
 */
export function withServedModels(system: AgenticSystem): AgenticSystem {
  const leadAgent = withServedModel(system.leadAgent, DEFAULT_LEAD_MODEL_ID)
  return leadAgent === system.leadAgent ? system : { ...system, leadAgent }
}
