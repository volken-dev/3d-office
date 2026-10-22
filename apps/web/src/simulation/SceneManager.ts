import * as THREE from "three/webgpu"
import { type AgenticSystem, getAllAgents } from "../data/agents"
import {
  clearScreenPositions,
  notifyScreenPositions,
  setScreenPosition,
} from "../integration/screenPositions"
import { type Task, useCoreStore } from "../integration/store/coreStore"
import { getActiveAgentSet, useTeamStore } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import { AgentBehavior } from "../types"
import { CharacterController } from "./CharacterController"
import {
  ALPHA_LERP_RATE,
  BUBBLE_Y_OFFSET,
  CHARACTER_MODEL_URL,
  CHAT_STANDOFF,
  OFFICE_MODEL_URL,
  OVERLAP_ALPHA,
  OVERLAP_DIST_SQ,
} from "./constants"
import { AgentSimulation } from "./core/AgentSimulation"
import { Engine } from "./core/Engine"
import { Stage } from "./core/Stage"
import { DriverManager } from "./drivers/DriverManager"
import { CharacterManager } from "./entities/CharacterManager"
import { InputManager } from "./input/InputManager"
import { createSceneLoader } from "./loaders"
import { NavMeshManager } from "./pathfinding/NavMeshManager"
import { PoiManager } from "./world/PoiManager"
import { WorldManager } from "./world/WorldManager"

/** Clamp so a long pause (hidden tab, design mode) doesn't teleport characters through walls. */
const MAX_FRAME_DELTA = 0.1

function isBusyStatus(status: Task["status"]): boolean {
  return status === "in_progress" || status === "on_hold" || status === "scheduled"
}

/** Agent indices in roster order, to tell a roster change from an edit of the same agents. */
function rosterKey(team: AgenticSystem): string {
  return getAllAgents(team)
    .map((agent) => agent.index)
    .join(",")
}

/**
 * Owns the 3D office and the agent simulation for the active team, and turns store changes
 * (tasks, chat, team selection) into character movement and animation.
 */
export class SceneManager {
  private engine: Engine
  private stage: Stage
  private characterManager: CharacterManager
  private controller: CharacterController | null = null
  private navMesh: NavMeshManager
  private poiManager: PoiManager
  private worldManager: WorldManager
  private driverManager: DriverManager | null = null
  private inputManager: InputManager | null = null
  private simulation: AgentSimulation | null = null

  private team: AgenticSystem
  private selectedIndex: number | null = null

  private unsubscribers: (() => void)[] = []
  private isDisposed = false
  private container: HTMLElement
  private resizeObserver: ResizeObserver
  private viewportWidth: number
  private viewportHeight: number
  private isSyncing = false
  private pendingSyncDelta = 0
  private readonly scratchPosition = new THREE.Vector3()

  /** Resolves once the scene renders; rejects if WebGPU/WebGL2 or the models fail to load. */
  public readonly ready: Promise<void>

  constructor(container: HTMLElement) {
    this.container = container
    this.viewportWidth = container.clientWidth
    this.viewportHeight = container.clientHeight
    this.team = getActiveAgentSet()

    this.engine = new Engine(container)
    this.stage = new Stage(this.engine.renderer.domElement)
    this.characterManager = new CharacterManager(this.stage.scene, this.team)
    this.navMesh = new NavMeshManager()
    this.poiManager = new PoiManager()
    this.characterManager.setPoiManager(this.poiManager)
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager)

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)

    this.simulation = new AgentSimulation(this.team)

    this.ready = this.init()
    this.ready.catch((error) => {
      if (!this.isDisposed) console.error("[SceneManager] Scene failed to load:", error)
    })
    this.startWatchingCoreStore()
    this.startWatchingTeamStore()
  }

  /**
   * Renderer init and both model downloads/decodes overlap; only the setup after them is ordered.
   * The world is set up before the characters because character spawns need its POIs.
   */
  private async init() {
    const loader = createSceneLoader()
    const [, officeGltf, characterGltf] = await Promise.all([
      this.engine.init(),
      loader.load(OFFICE_MODEL_URL),
      loader.load(CHARACTER_MODEL_URL),
    ]).finally(() => loader.dispose())
    if (this.isDisposed) return

    this.worldManager.setup(officeGltf, this.team.color)
    this.characterManager.setup(characterGltf)

    this.controller = new CharacterController(
      this.characterManager,
      this.navMesh,
      this.poiManager,
      this.team.user.index,
    )
    this.driverManager = new DriverManager(this.controller)
    this.registerDrivers()

    this.inputManager = new InputManager(
      this.engine.renderer.domElement,
      this.stage.camera,
      this.worldManager.getNavMeshes(),
      {
        getPositions: () => this.controller?.getCPUPositions() ?? null,
        getCount: () => this.controller?.getCount() ?? 0,
        getPois: () => this.poiManager.values(),
        isPointValid: (point) => this.navMesh.isPointOnNavMesh(point),
        onSelect: (agentIndex) => {
          const ui = useUiStore.getState()
          if (ui.isChatting) ui.setChatting(false)
          this.selectedIndex = agentIndex !== this.team.user.index ? agentIndex : null
          ui.setSelectedNpc(this.selectedIndex)
        },
        onFloorClick: (x, z) => this.driverManager?.getPlayerDriver()?.onFloorClick(x, z),
        onHover: (agentIndex) => useUiStore.getState().setHoveredNpc(agentIndex),
        onPoiHover: (id, label, position) =>
          useUiStore.getState().setHoveredPoi(id, label, position),
        onPoiClick: (id) => this.driverManager?.getPlayerDriver()?.onPoiClick(id),
      },
    )

    this.startWatchingUiStore()
    this.engine.renderer.setAnimationLoop(this.animate)
  }

  private registerDrivers() {
    if (!this.driverManager) return
    const playerIndex = this.team.user.index
    const leadIndex = this.team.leadAgent.index
    this.driverManager.dispose()
    this.driverManager.registerPlayer(playerIndex)
    for (const agent of getAllAgents(this.team)) {
      if (agent.index !== playerIndex)
        this.driverManager.registerNpc(agent.index, agent.index === leadIndex)
    }
    this.syncDriverState()
  }

  /** Pushes task and phase state to the NPC drivers so they don't scan the store every frame. */
  private syncDriverState() {
    if (!this.driverManager) return
    const { tasks, phase } = useCoreStore.getState()
    const busy = new Set(
      tasks.filter((task) => isBusyStatus(task.status)).map((task) => task.assignedAgentId),
    )
    for (const driver of this.driverManager.npcDrivers()) {
      driver.setBusy(busy.has(driver.agentIndex))
      driver.setProjectDone(phase === "done")
    }
  }

  /**
   * Renderer resizes are skipped during a Kanban drag (see onResize), so the final size is applied
   * once it ends. Task status changes move each affected agent: on hold to the boardroom, in
   * progress to a desk, just done back to spawn.
   */
  private startWatchingCoreStore() {
    this.unsubscribers.push(
      useCoreStore.subscribe((state, previousState) => {
        if (previousState.isResizing && !state.isResizing) this.onResize()
        if (state.tasks === previousState.tasks && state.phase === previousState.phase) return
        this.syncDriverState()
        if (state.tasks === previousState.tasks) return

        const agentIndices = new Set(
          state.tasks
            .map((task) => task.assignedAgentId)
            // TODO(#12): assumes the user is index 0
            .filter((agentIndex) => agentIndex !== undefined && agentIndex !== 0),
        )
        for (const agentIndex of agentIndices) {
          const agentTasks = state.tasks.filter((task) => task.assignedAgentId === agentIndex)
          const hasChange = agentTasks.some((task) => {
            const previousTask = previousState.tasks.find((candidate) => candidate.id === task.id)
            return !previousTask || previousTask.status !== task.status
          })
          if (!hasChange) continue

          const onHold = agentTasks.find((task) => task.status === "on_hold")
          const inProgress = agentTasks.find((task) => task.status === "in_progress")
          const justDone = agentTasks.some(
            (task) =>
              task.status === "done" &&
              !previousState.tasks.find(
                (previousTask) => previousTask.id === task.id && previousTask.status === "done",
              ),
          )

          if (onHold) {
            this.moveNpcToBoardroom(agentIndex)
          } else if (inProgress) {
            this.setNpcWorking(agentIndex)
          } else if (justDone) {
            this.moveNpcToSpawn(agentIndex)
          }
        }
      }),
    )
  }

  private startWatchingTeamStore() {
    this.unsubscribers.push(
      useTeamStore.subscribe(() => {
        const next = getActiveAgentSet()
        if (next === this.team) return
        const previous = this.team
        this.team = next

        if (next.id !== previous.id || rosterKey(next) !== rosterKey(previous)) {
          this.applyTeamChange()
        } else {
          this.simulation?.updateSystem(next)
        }
      }),
    )
  }

  /**
   * A different team, or agents added/removed: new simulation, characters and drivers, everyone
   * back at spawn. While still loading, init() builds everything from this.team instead.
   */
  private applyTeamChange() {
    const team = this.team
    this.simulation?.dispose()
    this.simulation = new AgentSimulation(team)
    this.worldManager.updateThemeColor(team.color)

    if (!this.controller) return
    this.controller.setTeam(team)
    this.registerDrivers()
    this.controller.warpAllToSpawn(
      team.user.index,
      getAllAgents(team).map((agent) => agent.index),
    )
  }

  private startWatchingUiStore() {
    this.unsubscribers.push(
      useUiStore.subscribe((state, previousState) => {
        const controller = this.controller
        if (!controller) return
        if (
          state.isChatting === previousState.isChatting &&
          state.isThinking === previousState.isThinking &&
          state.isTyping === previousState.isTyping
        )
          return

        const user = this.team.user.index
        if (state.isChatting && !previousState.isChatting && state.selectedNpcIndex !== null) {
          this.startChatVisuals(state.selectedNpcIndex)
        }

        if (state.isChatting && state.selectedNpcIndex !== null) {
          const npc = state.selectedNpcIndex
          if (controller.getState(npc) !== "walk")
            controller.play(npc, state.isThinking ? "talk" : "listen")
          controller.setSpeaking(npc, state.isThinking)
          if (controller.getState(user) !== "walk")
            controller.play(user, state.isTyping ? "talk" : "listen")
          controller.setSpeaking(user, state.isTyping)
        } else if (!state.isChatting && previousState.isChatting) {
          const npc = previousState.selectedNpcIndex
          if (npc !== null) {
            this.driverManager?.getNpcDriver(npc)?.setChatting(false)
            controller.setSpeaking(npc, false)
            controller.play(npc, "idle")
            controller.poiManager.releaseAll(npc)
          }
          controller.setSpeaking(user, false)
          controller.play(user, "idle")
          this.selectedIndex = null
        }
      }),
    )
  }

  /** Walks the player over to the NPC and turns the two to face each other. */
  private startChatVisuals(npcIndex: number): void {
    const controller = this.controller
    if (!controller) return
    const positions = controller.getCPUPositions()
    if (!positions) return
    const user = this.team.user.index
    const npc = new THREE.Vector3(positions[npcIndex * 4], 0, positions[npcIndex * 4 + 2])
    const player = new THREE.Vector3(positions[user * 4], 0, positions[user * 4 + 2])
    const direction = new THREE.Vector3().subVectors(player, npc).normalize()
    if (direction.length() < 0.01) direction.set(1, 0, 0)
    const target = npc.clone().addScaledVector(direction, CHAT_STANDOFF)

    this.selectedIndex = npcIndex
    this.driverManager?.getNpcDriver(npcIndex)?.setChatting(true)
    controller.cancelMovement(npcIndex)
    controller.play(npcIndex, "listen")
    controller.getAgentStateBuffer()?.setWaypoint(npcIndex, direction.x, direction.z)
    this.driverManager?.getPlayerDriver()?.walkTo(target, "listen", () => {
      const arrivedPositions = controller.getCPUPositions()
      if (!arrivedPositions) return
      const facingX = arrivedPositions[npcIndex * 4] - arrivedPositions[user * 4]
      const facingZ = arrivedPositions[npcIndex * 4 + 2] - arrivedPositions[user * 4 + 2]
      controller.getAgentStateBuffer()?.setWaypoint(user, facingX, facingZ)
      controller.getAgentStateBuffer()?.setWaypoint(npcIndex, -facingX, -facingZ)
    })
  }

  /** Opens the chat with the currently selected NPC. */
  public startChat(): void {
    useUiStore.getState().setChatting(true)
  }

  public async sendMessage(text: string): Promise<void> {
    const { selectedNpcIndex, isThinking } = useUiStore.getState()
    if (selectedNpcIndex === null || isThinking || !this.simulation) return
    useUiStore.setState({ isThinking: true, isTyping: false })
    try {
      await this.simulation.handleUserMessage(selectedNpcIndex, text)
    } catch (error) {
      console.error("[SceneManager] sendMessage error:", error)
    } finally {
      useUiStore.setState({ isThinking: false })
    }
  }

  /** Sends the agent to its own desk (`sit_work-<index>`), or to a desk picked by index if the office has none for it. */
  public setNpcWorking(index: number): void {
    if (!this.controller) return
    let poi = this.poiManager.getPoi(`sit_work-${index}`)
    if (!poi) {
      const desks = this.poiManager.getPoisByPrefix("sit_work")
      // TODO(#12): assumes agent indices start at 1
      if (desks.length > 0) poi = desks[(index - 1) % desks.length]
    }
    if (poi) this.controller.walkToPoi(index, poi.id)
  }

  public moveNpcToBoardroom(index: number): void {
    if (!this.controller) return
    const poi = this.poiManager.getPoi("area-boardroom") || this.poiManager.getPoi("boardroom")
    if (poi) this.controller.walkToPoi(index, poi.id)
  }

  public moveNpcToSpawn(index: number): void {
    if (!this.controller) return
    const poi = this.poiManager.getPoi(`spawn-${index}`)
    if (poi)
      this.controller.moveTo(index, poi.position, "idle", undefined, undefined, poi.quaternion)
  }

  private onResize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.viewportWidth = width
    this.viewportHeight = height
    this.stage.onResize(width, height)
    if (!useCoreStore.getState().isResizing) this.engine.onResize(width, height)
  }

  /**
   * One frame. Skipped in design mode, where the canvas is hidden behind the editor. The GPU→CPU
   * position readback is async, so a new one is never queued while the previous is in flight; the
   * frame time it covers accumulates until it resolves.
   */
  private animate = () => {
    this.engine.timer.update()
    const deltaSeconds = Math.min(this.engine.timer.getDelta(), MAX_FRAME_DELTA)
    if (useCoreStore.getState().viewMode === "design") return

    const controller = this.controller
    this.engine.trackFrame(deltaSeconds)
    this.stage.update()
    controller?.update(deltaSeconds, this.engine.renderer)

    this.pendingSyncDelta += deltaSeconds
    if (controller && !this.isSyncing) {
      this.isSyncing = true
      const syncDelta = this.pendingSyncDelta
      this.pendingSyncDelta = 0
      controller
        .syncFromGPU(this.engine.renderer)
        .then((positions) => {
          if (!positions || this.isDisposed || controller !== this.controller) return
          controller.updatePaths(positions)
          this.driverManager?.update(positions, syncDelta)
          this.updateTransparency(positions, syncDelta)
        })
        .finally(() => {
          this.isSyncing = false
        })
    }

    const player = this.team.user.index
    const followed =
      controller?.getCPUPosition(this.selectedIndex ?? player, this.scratchPosition) ?? false
    this.stage.setFollowTarget(followed ? this.scratchPosition : null)
    if (controller) {
      const camera = this.stage.camera
      const bubblePosition = this.scratchPosition
      for (let agentIndex = 0; agentIndex < controller.getCount(); agentIndex++) {
        if (!controller.getCPUPosition(agentIndex, bubblePosition)) continue
        bubblePosition.y += BUBBLE_Y_OFFSET
        bubblePosition.project(camera)
        setScreenPosition(
          agentIndex,
          (bubblePosition.x * 0.5 + 0.5) * this.viewportWidth,
          (bubblePosition.y * -0.5 + 0.5) * this.viewportHeight,
        )
      }
      notifyScreenPositions()
    }
    this.stage.setChatMode(
      useUiStore.getState().isChatting,
      controller?.getAgentState(player) === AgentBehavior.GOTO,
    )
    this.engine.render(this.stage.scene, this.stage.camera)
  }

  /** Fades characters that overlap so neither hides the other. */
  private updateTransparency(positions: Float32Array, deltaSeconds: number) {
    if (!this.controller) return
    const count = this.controller.getCount()
    const buffer = this.controller.getAgentStateBuffer()
    if (!buffer) return
    for (let agentIndex = 0; agentIndex < count; agentIndex++) {
      let overlap = false
      for (let otherIndex = 0; otherIndex < count; otherIndex++) {
        if (agentIndex === otherIndex) continue
        if (
          (positions[agentIndex * 4] - positions[otherIndex * 4]) ** 2 +
            (positions[agentIndex * 4 + 2] - positions[otherIndex * 4 + 2]) ** 2 <
          OVERLAP_DIST_SQ
        ) {
          overlap = true
          break
        }
      }
      const currentAlpha = buffer.getAlpha(agentIndex)
      const targetAlpha = overlap ? OVERLAP_ALPHA : 1.0
      if (Math.abs(currentAlpha - targetAlpha) > 0.01)
        buffer.setAlpha(
          agentIndex,
          THREE.MathUtils.lerp(
            currentAlpha,
            targetAlpha,
            Math.min(deltaSeconds * ALPHA_LERP_RATE, 1.0),
          ),
        )
    }
  }

  public resetScene() {
    if (!this.controller) return
    useUiStore.getState().setChatting(false)
    const agents = getAllAgents(this.team)
    for (const agent of agents) this.controller.setSpeaking(agent.index, false)
    this.controller.warpAllToSpawn(
      this.team.user.index,
      agents.map((agent) => agent.index),
    )
    this.stage.setFollowTarget(null)
    this.stage.setChatMode(false, false)
  }

  /** Stops the render loop and the agent loop and releases every listener, subscription and GPU resource. Idempotent. */
  public dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    this.simulation?.dispose()
    this.simulation = null
    this.inputManager?.dispose()
    this.inputManager = null
    this.resizeObserver.disconnect()
    this.driverManager?.dispose()
    this.stage.dispose()
    this.characterManager.dispose()
    this.worldManager.dispose()
    this.engine.dispose()
    clearScreenPositions()
  }
}
