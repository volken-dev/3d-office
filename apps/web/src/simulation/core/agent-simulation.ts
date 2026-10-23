import { type AgenticSystem, getAllAgents } from "@the-delegation/agents/team"
import { useCoreStore } from "../../integration/store/core-store"
import { useUiStore } from "../../integration/store/ui-store"
import { AgentHost } from "./agent-host"

/** Safety net for work that no store change re-triggers. */
const HEARTBEAT_MS = 5000
const SPARK_DEBOUNCE_MS = 1000
/** Tasks start after a staggered delay so agents don't all call the API at once. */
const TASK_START_DELAY_MS = 1000
const TASK_START_JITTER_MS = 2000

function delay(milliseconds: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Drives the team autonomously from store state: the lead proposes tasks (spark), agents run
 * scheduled tasks, and the lead delivers once every task is done.
 *
 * Retry policy (backoff, attempt cap, call budget, pausing for the user) lives in AgentBrain, which
 * stays busy while it waits, so re-triggering here never doubles up calls. Nothing starts while the
 * API-key dialog is open.
 */
export class AgentSimulation {
  private readonly agents = new Map<number, AgentHost>()
  private currentSystem: AgenticSystem
  private unsubscribers: (() => void)[] = []
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private lastSparkAt = 0
  private disposed = false
  /** Task ids with a live execution, so a task is never started twice. */
  private readonly running = new Set<string>()

  constructor(system: AgenticSystem) {
    this.currentSystem = system
    for (const agentData of getAllAgents(system)) {
      this.agents.set(agentData.index, new AgentHost(agentData, this))
    }
    this.startStateMonitoring()
  }

  /** The lead skips sparking while the user chats with it, so a chat ending re-sparks an empty board. */
  private startStateMonitoring() {
    this.heartbeat = setInterval(() => {
      const { phase, tasks } = useCoreStore.getState()
      if (phase !== "working") return
      if (tasks.length === 0) {
        void this.triggerAutonomousStrategy()
      } else {
        this.processScheduledTasks()
        void this.checkProjectCompletion()
      }
    }, HEARTBEAT_MS)

    this.unsubscribers.push(
      useCoreStore.subscribe((state, previousState) => {
        if (state.tasks === previousState.tasks && state.phase === previousState.phase) return

        if (
          state.phase === "working" &&
          previousState.phase === "idle" &&
          state.tasks.length === 0
        ) {
          void this.triggerAutonomousStrategy()
        }
        if (state.phase === "working") this.processScheduledTasks()
        void this.checkProjectCompletion()
      }),
    )

    this.unsubscribers.push(
      useUiStore.subscribe((state, previousState) => {
        if (previousState.isChatting && !state.isChatting) {
          const core = useCoreStore.getState()
          if (core.phase === "working" && core.tasks.length === 0)
            void this.triggerAutonomousStrategy()
        }
      }),
    )
  }

  /**
   * Starts every scheduled (or abandoned in-progress) task whose agent is free. The UI status is
   * read per task because starting one marks its agent busy for the rest of the loop.
   */
  public processScheduledTasks() {
    if (this.disposed) return
    const state = useCoreStore.getState()
    if (state.phase !== "working") return

    for (const task of state.tasks) {
      if (task.status !== "scheduled" && task.status !== "in_progress") continue
      if (this.running.has(task.id)) continue

      const agent = this.getAgent(task.assignedAgentId)
      const uiStatus = useUiStore.getState().agentStatuses[task.assignedAgentId]
      if (agent && (agent.state === "idle" || uiStatus === "idle") && !agent.isThinking) {
        void this.startTaskExecution(agent, task.id)
      }
    }
  }

  private async triggerAutonomousStrategy() {
    if (this.disposed) return
    const lead = this.getAgent(this.currentSystem.leadAgent.index)
    const ui = useUiStore.getState()

    if (!lead || lead.isThinking || useCoreStore.getState().tasks.length > 0) return
    if (ui.isChatting && ui.selectedNpcIndex === lead.data.index) return
    if (Date.now() - this.lastSparkAt < SPARK_DEBOUNCE_MS) return
    this.lastSparkAt = Date.now()

    try {
      await lead.spark()
    } catch (error) {
      console.error("[AgentSimulation] Planning turn failed:", error)
    }
  }

  private async startTaskExecution(agent: AgentHost, taskId: string) {
    this.running.add(taskId)
    agent.setTask(taskId)
    useCoreStore.getState().updateTaskStatus(taskId, "in_progress")

    try {
      await delay(TASK_START_DELAY_MS + Math.random() * TASK_START_JITTER_MS)
      if (this.disposed || agent.isThinking) return
      await agent.executeTask(taskId)
    } catch (error) {
      console.error(`[AgentSimulation] Agent ${agent.data.index} failed task ${taskId}:`, error)
    } finally {
      this.running.delete(taskId)
      if (!this.disposed) this.finishTaskExecution(agent)
    }
  }

  /**
   * An agent waiting for review keeps its task. Completion is re-checked because the lead may have
   * been busy when the last task finished (one-agent teams).
   */
  private finishTaskExecution(agent: AgentHost) {
    if (agent.state !== "on_hold") agent.setTask(null)

    this.processScheduledTasks()
    void this.checkProjectCompletion()
  }

  private async checkProjectCompletion() {
    if (this.disposed) return
    const { phase, tasks } = useCoreStore.getState()
    if (phase !== "working" || tasks.length === 0 || !tasks.every((task) => task.status === "done"))
      return

    const lead = this.getAgent(this.currentSystem.leadAgent.index)
    if (!lead || lead.isThinking) return

    try {
      await lead.concludeProject()
    } catch (error) {
      console.error("[AgentSimulation] Delivery turn failed:", error)
    }
  }

  public get system(): AgenticSystem {
    return this.currentSystem
  }

  public getAgent(index: number): AgentHost | undefined {
    return this.agents.get(index)
  }

  public getAllAgents(): AgentHost[] {
    return Array.from(this.agents.values())
  }

  /** Applies edits to the current team's agents (model, prompt, human-in-the-loop) without restarting. */
  public updateSystem(system: AgenticSystem) {
    this.currentSystem = system
    for (const agentNode of getAllAgents(system)) {
      const host = this.agents.get(agentNode.index)
      if (host) host.data = agentNode
    }
  }

  /** Records the user's message and runs the agent's reply. Returns false (and records nothing) if the agent can't chat now. */
  public async handleUserMessage(agentIndex: number, text: string): Promise<boolean> {
    const agent = this.getAgent(agentIndex)
    if (!agent?.canChat()) return false
    await agent.chat(text)
    return true
  }

  public dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    for (const agent of this.agents.values()) agent.dispose()
  }
}
