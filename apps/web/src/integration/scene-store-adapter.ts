import type { AgenticSystem } from "@the-delegation/agents/team"
import { SceneManager } from "../simulation/scene-manager"
import type { TeamRuntime } from "./orchestration/team-runtime"
import {
  chatIntents,
  initialSceneIntents,
  layoutIntents,
  projectIntents,
  type SceneIntent,
  selectionForClick,
  teamIntents,
} from "./scene-intents"
import { useCoreStore } from "./store/core-store"
import { getActiveAgentSet, useTeamStore } from "./store/team-store"
import { useUiStore } from "./store/ui-store"

/**
 * Connects a `SceneManager` to the stores: store changes become scene intents (see
 * `scene-intents.ts`), and the user's clicks and hovers in the scene become store updates. It is
 * also the imperative scene API components reach through `SceneContext`.
 */
export class SceneStoreAdapter {
  private readonly scene: SceneManager
  private readonly runtime: TeamRuntime
  private team: AgenticSystem
  private unsubscribers: (() => void)[] = []
  private isDisposed = false

  /** Resolves once the scene renders; rejects if WebGPU/WebGL2 or the models fail to load. */
  public readonly ready: Promise<void>

  /**
   * `runtime` runs the agents and outlives this adapter. `onDeviceLost` fires once the GPU device
   * is gone and the scene must be rebuilt by its owner.
   */
  constructor(container: HTMLElement, runtime: TeamRuntime, onDeviceLost: () => void) {
    this.runtime = runtime
    this.team = getActiveAgentSet()
    this.scene = new SceneManager(container, this.team, {
      onAgentClick: (agentIndex) => this.selectAgent(agentIndex),
      onAgentHover: (agentIndex) => useUiStore.getState().setHoveredNpc(agentIndex),
      onPoiHover: (id, label, position) => useUiStore.getState().setHoveredPoi(id, label, position),
      onDeviceLost,
    })
    this.ready = this.scene.ready

    const core = useCoreStore.getState()
    const ui = useUiStore.getState()
    this.dispatch(initialSceneIntents(core, core, ui))
    this.unsubscribers.push(
      useCoreStore.subscribe((state, previousState) =>
        this.dispatch([
          ...layoutIntents(previousState, state),
          ...projectIntents(previousState, state, this.team),
        ]),
      ),
      useTeamStore.subscribe(() => {
        const next = getActiveAgentSet()
        const intents = teamIntents(this.team, next)
        this.team = next
        this.dispatch(intents)
      }),
      useUiStore.subscribe((state, previousState) =>
        this.dispatch(chatIntents(previousState, state)),
      ),
    )
  }

  private dispatch(intents: readonly SceneIntent[]) {
    for (const intent of intents) this.scene.apply(intent)
  }

  /** A click closes any open chat, then selects the clicked agent (the camera follows it). */
  private selectAgent(clickedIndex: number | null) {
    const ui = useUiStore.getState()
    if (ui.isChatting) ui.setChatting(false)
    const selectedIndex = selectionForClick(clickedIndex, this.team)
    this.scene.followAgent(selectedIndex)
    ui.setSelectedNpc(selectedIndex)
  }

  /** Opens the chat with the currently selected agent. */
  public startChat(): void {
    useUiStore.getState().setChatting(true)
  }

  /** Sends the user's message to the selected agent; ignored while it is still answering. */
  public async sendMessage(text: string): Promise<void> {
    const { selectedNpcIndex, isThinking } = useUiStore.getState()
    if (selectedNpcIndex === null || isThinking || this.isDisposed) return
    useUiStore.setState({ isThinking: true, isTyping: false })
    try {
      await this.runtime.sendUserMessage(selectedNpcIndex, text)
    } catch (error) {
      console.error("[SceneStoreAdapter] sendMessage error:", error)
    } finally {
      useUiStore.setState({ isThinking: false })
    }
  }

  /** Closes any chat and puts every character back at spawn. */
  public resetScene(): void {
    if (this.isDisposed) return
    useUiStore.getState().setChatting(false)
    this.scene.resetScene()
  }

  /** Stops listening to the stores, then disposes the scene. Idempotent. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    this.scene.dispose()
  }
}
