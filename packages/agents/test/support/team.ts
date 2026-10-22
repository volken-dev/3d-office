import type { AgenticSystem } from "../../src/team"

/** A small team with the shapes the tests need: a reviewed lead, one reviewed and two autonomous agents. */
export const TEST_TEAM: AgenticSystem = {
  id: "test-squad",
  teamName: "Test Squad",
  teamType: "Testing",
  teamDescription: "Fixture team for agent tests.",
  color: "#4285F4",
  outputAutoApprove: false,
  user: { index: 0, model: "Human" },
  leadAgent: {
    id: "lead",
    index: 1,
    name: "Tech Lead",
    description: "Plans the work.",
    color: "#4285F4",
    model: "claude-opus-5-5",
    humanInTheLoop: true,
    subagents: [
      {
        id: "pm",
        index: 2,
        name: "Product Manager",
        description: "Writes stories.",
        color: "#A142F4",
        model: "claude-sonnet-5-5",
        humanInTheLoop: true,
      },
      {
        id: "engineer",
        index: 3,
        name: "Engineer",
        description: "Builds features.",
        color: "#34A853",
        model: "claude-sonnet-5-5",
      },
      {
        id: "qa",
        index: 4,
        name: "QA Engineer",
        description: "Tests features.",
        color: "#EA4335",
        model: "claude-sonnet-5-5",
      },
    ],
  },
}
