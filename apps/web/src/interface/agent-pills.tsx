import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AgentState } from "../data/agent-states"
import { getOfficeAgentsSnapshot, selectAgent, useOfficeAgents } from "../integration/office-agents"

/** Each contract state in plain words, for the pills' accessible labels. */
const AGENT_STATE_WORDS: Record<AgentState, string> = {
  working: "working",
  shipping: "shipping",
  waiting_for_input: "waiting for input",
  idle: "idle",
  paused_or_rate_limited: "paused or rate limited",
  error: "error",
  done: "done",
  arrive: "arriving",
  queued: "queued",
}

interface AgentPillsProps {
  agentIndices: readonly number[]
  /** Called with the newly selected robot, so the host can point the camera at it. */
  onSelect: (agentIndex: number | null) => void
}

/**
 * One pill per robot, centred over the top of the canvas. Each pill is its own Tab stop; focusing
 * or clicking it selects that robot, and the pressed pill follows the store's selection, so a
 * canvas click shows here too. Clicking the pressed pill keeps it selected; Esc clears it.
 */
export function AgentPills({ agentIndices, onSelect }: AgentPillsProps) {
  const { statuses, selectedAgentIndex } = useOfficeAgents()

  const select = (agentIndex: number) => {
    if (agentIndex === getOfficeAgentsSnapshot().selectedAgentIndex) return
    selectAgent(agentIndex)
    onSelect(agentIndex)
  }

  const onValueChange = (value: string) => {
    const agentIndex = agentIndices.find((candidate) => String(candidate) === value)
    if (agentIndex !== undefined) select(agentIndex)
  }

  return (
    <div
      data-agent-pills=""
      className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3"
    >
      <ToggleGroup
        type="single"
        rovingFocus={false}
        variant="floating"
        size="sm"
        spacing={2}
        value={selectedAgentIndex === null ? "" : String(selectedAgentIndex)}
        onValueChange={onValueChange}
        aria-label="Agents"
        className="pointer-events-auto flex-wrap justify-center"
      >
        {agentIndices.map((agentIndex) => {
          const status = statuses.get(agentIndex) ?? null
          const name = `Agent ${agentIndex}`
          return (
            <ToggleGroupItem
              key={agentIndex}
              value={String(agentIndex)}
              aria-label={status ? `${name}, ${AGENT_STATE_WORDS[status.state]}` : name}
              onFocus={() => select(agentIndex)}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-muted-foreground transition-colors"
                style={status ? { backgroundColor: status.statusColor } : undefined}
              />
              {name}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}
