import { AgentBrain, type BrainHost, type ThinkOptions } from "../../core/agent/AgentBrain"
import type { LLMMessage } from "../../core/llm/types"
import { canChatWith } from "../../core/orchestration/policy"
import { type AgentNode, isLeadAgent } from "../../data/agents"
import { useCoreStore } from "../../integration/store/coreStore"
import { useUiStore } from "../../integration/store/uiStore"
import type { AgentWorkStatus } from "../../types"
import type { AgentSimulation } from "./AgentSimulation"

/** Runtime wrapper around one team member: its brain, task and status. */
export class AgentHost implements BrainHost {
  public state: AgentWorkStatus = "idle"
  private currentTaskId: string | null = null
  private disposed = false
  public readonly brain: AgentBrain

  constructor(
    /** Replaced in place when the team is edited, so the next LLM turn uses the new model/prompt. */
    public data: AgentNode,
    public readonly simulation: AgentSimulation,
  ) {
    this.brain = new AgentBrain(this)
  }

  /** Same rule the chat UI applies (useChatAvailability), so an accepted message always gets a turn. */
  public canChat(): boolean {
    return canChatWith({
      phase: useCoreStore.getState().phase,
      isLead: isLeadAgent(this.simulation.system, this.data.index),
      status: this.state,
    })
  }

  public think(prompt: string, options: ThinkOptions = {}) {
    return this.brain.think(prompt, options)
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

  /** A disposed host belongs to a previous team, and its index may now be someone else's, so it no longer writes the store. */
  public setState(state: AgentWorkStatus) {
    this.state = state
    if (!this.disposed) useUiStore.getState().setAgentStatus(this.data.index, state)
  }

  public appendHistory(message: LLMMessage) {
    this.brain.appendHistory(message)
  }

  public get isThinking(): boolean {
    return this.brain.isThinking
  }

  /** Aborts the in-flight LLM call and drops the brain's store subscription. */
  public dispose() {
    this.disposed = true
    this.brain.dispose()
  }
}
