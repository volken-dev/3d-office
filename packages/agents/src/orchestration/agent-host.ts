import { AgentBrain, type BrainHost } from "../agent/agent-brain"
import type { AgentWorkStatus } from "../project/types"
import { type AgenticSystem, type AgentNode, isLeadAgent } from "../team"
import { canChatWith } from "./policy"
import type { TeamOrchestratorDeps } from "./ports"

/** What a host needs from the orchestrator that owns it. */
export interface AgentHostOwner {
  readonly system: AgenticSystem
  processScheduledTasks(): void
}

/** Runtime wrapper around one team member: its brain, task and status. */
export class AgentHost implements BrainHost {
  public state: AgentWorkStatus = "idle"
  private currentTaskId: string | null = null
  private disposed = false
  public readonly brain: AgentBrain

  constructor(
    /** Replaced in place when the team is edited, so the next LLM turn uses the new model/prompt. */
    public data: AgentNode,
    private readonly owner: AgentHostOwner,
    private readonly dependencies: TeamOrchestratorDeps,
  ) {
    this.brain = new AgentBrain(this, dependencies)
  }

  /** Same rule the chat UI applies (useChatAvailability), so an accepted message always gets a turn. */
  public canChat(): boolean {
    return canChatWith({
      phase: this.dependencies.project.snapshot().phase,
      isLead: isLeadAgent(this.owner.system, this.data.index),
      status: this.state,
    })
  }

  public chat(text: string) {
    return this.brain.chat(text)
  }

  public spark() {
    return this.brain.spark()
  }

  public executeTask(taskId: string) {
    return this.brain.executeTask(taskId)
  }

  public concludeProject() {
    return this.brain.concludeProject()
  }

  public getCurrentTaskId(): string | null {
    return this.currentTaskId
  }

  public setTask(taskId: string | null) {
    this.currentTaskId = taskId
    this.setState(taskId ? "working" : "idle")
  }

  /** A disposed host belongs to a previous team, and its index may now be someone else's, so it no longer reports status. */
  public setState(state: AgentWorkStatus) {
    this.state = state
    if (!this.disposed) this.dependencies.agentStatus.setAgentStatus(this.data.index, state)
  }

  public onTurnSettled() {
    this.owner.processScheduledTasks()
  }

  public get isThinking(): boolean {
    return this.brain.isThinking
  }

  /** Aborts the in-flight LLM call and drops the brain's project subscription. */
  public dispose() {
    this.disposed = true
    this.brain.dispose()
  }
}
