import {
  type AgenticSystem,
  type AgentNode,
  getAllAgents,
  USER_ID,
  USER_NAME,
} from "@the-delegation/agents/team"
import { DEFAULT_LEAD_MODEL_ID, DEFAULT_TEAM_MODEL_ID } from "@the-delegation/llm/registry"
import { USER_COLOR } from "../theme/brand"

export const DEFAULT_AGENTIC_SET_ID = "feature-squad"

export const AGENTIC_SETS: AgenticSystem[] = [
  {
    id: "feature-squad",
    teamName: "Feature Squad",
    teamType: "Product Engineering",
    teamDescription:
      "A cross-functional squad that turns a feature request into a spec, implementation plan and test strategy.",
    color: "#4285F4",
    outputAutoApprove: false,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: "tech-lead",
      index: 1,
      name: "Tech Lead",
      description:
        "Breaks features into well-scoped engineering tasks, coordinates the squad and owns the final technical plan.",
      color: "#4285F4",
      model: DEFAULT_LEAD_MODEL_ID,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: "product-manager",
          index: 2,
          name: "Product Manager",
          description:
            "Defines user stories, acceptance criteria and scope boundaries for the feature.",
          color: "#A142F4",
          model: DEFAULT_TEAM_MODEL_ID,
          humanInTheLoop: true,
          position: { x: -450, y: 280 },
        },
        {
          id: "frontend-engineer",
          index: 3,
          name: "Frontend Engineer",
          description:
            "Designs UI components, client state, routing and accessibility for the feature.",
          color: "#FBBC05",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: -150, y: 280 },
        },
        {
          id: "backend-engineer",
          index: 4,
          name: "Backend Engineer",
          description:
            "Designs APIs, data models, migrations and service integrations for the feature.",
          color: "#34A853",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 150, y: 280 },
        },
        {
          id: "qa-engineer",
          index: 5,
          name: "QA Engineer",
          description:
            "Writes the test plan: unit, integration and end-to-end cases, plus edge cases and regressions to watch.",
          color: "#EA4335",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 450, y: 280 },
        },
      ],
    },
  },
  {
    id: "architecture-council",
    teamName: "Architecture Council",
    teamType: "System Design",
    teamDescription:
      "Senior engineers who produce a design doc with trade-offs for a new system or major change.",
    color: "#0EA5E9",
    outputAutoApprove: false,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: "principal-architect",
      index: 1,
      name: "Principal Architect",
      description:
        "Frames the problem, weighs alternatives and writes the final design doc with a clear recommendation.",
      color: "#0EA5E9",
      model: DEFAULT_LEAD_MODEL_ID,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: "systems-engineer",
          index: 2,
          name: "Systems Engineer",
          description: "Proposes service boundaries, APIs, data flow and consistency model.",
          color: "#6366F1",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: -300, y: 280 },
        },
        {
          id: "data-engineer",
          index: 3,
          name: "Data Engineer",
          description: "Designs storage, schemas, indexing, retention and migration strategy.",
          color: "#14B8A6",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 0, y: 280 },
        },
        {
          id: "sre",
          index: 4,
          name: "SRE",
          description: "Covers deployment, scaling, observability, failure modes and cost.",
          color: "#F97316",
          model: DEFAULT_TEAM_MODEL_ID,
          humanInTheLoop: true,
          position: { x: 300, y: 280 },
        },
      ],
    },
  },
  {
    id: "bug-hunters",
    teamName: "Bug Hunters",
    teamType: "Debugging",
    teamDescription:
      "A sequential pipeline from bug report to root cause, fix plan and regression tests.",
    color: "#DC2626",
    outputAutoApprove: true,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: "triage-lead",
      index: 1,
      name: "Triage Lead",
      description:
        "Clarifies the bug report, assesses severity and delivers the final incident write-up.",
      color: "#DC2626",
      model: DEFAULT_LEAD_MODEL_ID,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: "debugger",
          index: 2,
          name: "Debugger",
          description:
            "Forms hypotheses, narrows down reproduction steps and identifies the root cause.",
          color: "#F59E0B",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 0, y: 260 },
          subagents: [
            {
              id: "fix-engineer",
              index: 3,
              name: "Fix Engineer",
              description: "Proposes the minimal code fix and the regression tests that prove it.",
              color: "#22C55E",
              model: DEFAULT_TEAM_MODEL_ID,
              humanInTheLoop: true,
              position: { x: 0, y: 390 },
            },
          ],
        },
      ],
    },
  },
  {
    id: "code-review-board",
    teamName: "Code Review Board",
    teamType: "Code Review",
    teamDescription:
      "Reviews a pasted diff or design from correctness, security and performance angles.",
    color: "#7C3AED",
    outputAutoApprove: true,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: "review-lead",
      index: 1,
      name: "Review Lead",
      description:
        "Collects the change under review, dispatches reviewers and merges their findings into one prioritized review.",
      color: "#7C3AED",
      model: DEFAULT_LEAD_MODEL_ID,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: "correctness-reviewer",
          index: 2,
          name: "Correctness Reviewer",
          description: "Finds logic bugs, unhandled edge cases and missing tests.",
          color: "#2563EB",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: -300, y: 280 },
        },
        {
          id: "security-reviewer",
          index: 3,
          name: "Security Reviewer",
          description: "Finds injection, auth, secrets-handling and data-exposure issues.",
          color: "#E11D48",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 0, y: 280 },
        },
        {
          id: "performance-reviewer",
          index: 4,
          name: "Performance Reviewer",
          description:
            "Finds hot-path inefficiencies, N+1 queries, memory growth and blocking work.",
          color: "#059669",
          model: DEFAULT_TEAM_MODEL_ID,
          position: { x: 300, y: 280 },
        },
      ],
    },
  },
  {
    id: "staff-engineer",
    teamName: "Staff Engineer",
    teamType: "Advisor",
    teamDescription:
      "A single senior engineer for quick technical questions, estimates and roadmap advice.",
    color: "#64748B",
    outputAutoApprove: true,
    user: { index: 0, model: "Human", position: { x: 0, y: 0 } },
    leadAgent: {
      id: "staff-engineer-advisor",
      index: 1,
      name: "Staff Engineer",
      description:
        "Gives pragmatic technical direction: approach, risks, estimates and next steps.",
      color: "#64748B",
      model: DEFAULT_LEAD_MODEL_ID,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
    },
  },
]

/** Resolves a team id against the user's custom teams first, then the built-ins, then the default team. */
export function getAgentSet(id: string, customSystems: AgenticSystem[] = []): AgenticSystem {
  return (
    customSystems.find((system) => system.id === id) ||
    AGENTIC_SETS.find((system) => system.id === id) ||
    AGENTIC_SETS[0]
  )
}

/** The user followed by every agent: one entry per character in the scene. */
export function getAllCharacters(system: AgenticSystem): AgentNode[] {
  const userNode: AgentNode = {
    id: USER_ID,
    index: system.user.index,
    name: USER_NAME,
    color: USER_COLOR,
    model: system.user.model,
    description: "Human user issuing commands.",
  }
  return [userNode, ...getAllAgents(system)]
}

export interface TeamRoster {
  system: AgenticSystem
  /** AI agents, lead first. */
  agents: readonly AgentNode[]
  /** The user followed by the agents, in render-slot order. */
  characters: readonly AgentNode[]
  byIndex: ReadonlyMap<number, AgentNode>
}

const rosterCache = new WeakMap<AgenticSystem, TeamRoster>()

/**
 * Memoized agents/characters/index lookup for a team. Treat the result as read-only. Systems are
 * immutable store values, so a derived roster can be cached per object.
 */
export function getTeamRoster(system: AgenticSystem): TeamRoster {
  let roster = rosterCache.get(system)
  if (!roster) {
    const characters = getAllCharacters(system)
    roster = {
      system,
      agents: characters.slice(1),
      characters,
      byIndex: new Map(characters.map((character) => [character.index, character])),
    }
    rosterCache.set(system, roster)
  }
  return roster
}

/** Looks up an agent or the user by index; undefined when the index is not in this team. */
export function getAgentByIndex(system: AgenticSystem, index: number): AgentNode | undefined {
  return getTeamRoster(system).byIndex.get(index)
}
