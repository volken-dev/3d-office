import { TeamOrchestrator } from "@the-delegation/agents/orchestration/team-orchestrator"
import { type AgenticSystem, hasSameRoster } from "@the-delegation/agents/team"
import { getActiveAgentSet, useTeamStore } from "../store/team-store"
import { zustandOrchestrationDeps } from "./zustand-deps"

/**
 * Runs the active team's agents, independently of the 3D scene, so a lost GPU device or a scene
 * that fails to load never interrupts them. A new team or roster gets a fresh orchestrator; edits
 * to the same roster (model, prompt, human-in-the-loop) apply in place.
 */
export class TeamRuntime {
  private team: AgenticSystem
  private orchestrator: TeamOrchestrator
  private readonly unsubscribe: () => void
  private isDisposed = false

  constructor() {
    this.team = getActiveAgentSet()
    this.orchestrator = new TeamOrchestrator(this.team, zustandOrchestrationDeps)
    this.unsubscribe = useTeamStore.subscribe(() => this.onTeamChange(getActiveAgentSet()))
  }

  private onTeamChange(next: AgenticSystem) {
    if (next === this.team) return
    if (hasSameRoster(this.team, next)) {
      this.orchestrator.updateSystem(next)
    } else {
      this.orchestrator.dispose()
      this.orchestrator = new TeamOrchestrator(next, zustandOrchestrationDeps)
    }
    this.team = next
  }

  /** Hands the user's chat message to the agent; false if it can't chat now or the runtime is gone. */
  public sendUserMessage(agentIndex: number, text: string): Promise<boolean> {
    if (this.isDisposed) return Promise.resolve(false)
    return this.orchestrator.handleUserMessage(agentIndex, text)
  }

  /** Stops every agent loop and aborts calls in flight. Idempotent. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.unsubscribe()
    this.orchestrator.dispose()
  }
}
