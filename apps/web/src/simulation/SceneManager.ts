import { type AgenticSystem, getAllAgents } from "@the-delegation/agents/team"
import * as THREE from "three/webgpu"
import type { AgentWork, SceneIntent } from "../integration/sceneIntents"
import {
  clearScreenPositions,
  notifyScreenPositions,
  setScreenPosition,
} from "../integration/screenPositions"
import { AgentBehavior } from "../types"
import { CharacterController } from "./CharacterController"
import { modelIdsUsedBy } from "./characters/characterAppearance"
import { DEFAULT_CHARACTER_MODEL_ID } from "./characters/characterModels"
import { loadCharacterModels } from "./characters/loadCharacterModels"
import { BUBBLE_Y_OFFSET, CHAT_STANDOFF, OFFICE_MODEL_URL } from "./constants"
import { AgentSimulation } from "./core/AgentSimulation"
import { Engine } from "./core/Engine"
import { Stage } from "./core/Stage"
import { DriverManager } from "./drivers/DriverManager"
import { CharacterManager } from "./entities/CharacterManager"
import { InputManager } from "./input/InputManager"
import { createSceneLoader } from "./loaders"
import { NavMeshManager } from "./pathfinding/NavMeshManager"
import { PoiManager } from "./world/PoiManager"
import { BOARDROOM_POI_ID, deskPoiId, spawnPoiId } from "./world/poiIds"
import { WorldManager } from "./world/WorldManager"

/** Clamp so a long pause (hidden tab, design mode) doesn't teleport characters through walls. */
const MAX_FRAME_DELTA = 0.1

/** What the scene reports back as the user points at and clicks things in the office. */
export interface SceneEvents {
  /** A character or empty space (null) was clicked. */
  onAgentClick(agentIndex: number | null): void
  onAgentHover(agentIndex: number | null): void
  onPoiHover(
    id: string | null,
    label: string | null,
    position: { x: number; y: number } | null,
  ): void
  /** The GPU device is gone: this scene can no longer render and should be rebuilt. */
  onDeviceLost(): void
}

/**
 * Owns the 3D office and the agent simulation for a team, and executes scene intents (movement,
 * chat, team changes) as character movement and animation. It reads no store: an integration
 * adapter derives the intents from store changes and receives the user's input through
 * `SceneEvents`.
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
  private readonly events: SceneEvents
  private agentWork: AgentWork = { busyAgentIndices: [], isProjectDone: false }
  private isChatMode = false
  private isRenderingPaused = false
  private isLayoutResizing = false

  private isDisposed = false
  private container: HTMLElement
  private resizeObserver: ResizeObserver
  private viewportWidth: number
  private viewportHeight: number
  private readonly scratchPosition = new THREE.Vector3()

  /** Resolves once the scene renders; rejects if WebGPU/WebGL2 or the models fail to load. */
  public readonly ready: Promise<void>

  constructor(container: HTMLElement, team: AgenticSystem, events: SceneEvents) {
    this.container = container
    this.viewportWidth = container.clientWidth
    this.viewportHeight = container.clientHeight
    this.team = team
    this.events = events

    this.engine = new Engine(container, () => {
      if (!this.isDisposed) this.events.onDeviceLost()
    })
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
  }

  /**
   * Renderer init and every model download/decode overlap; only the setup after them is ordered.
   * The world is set up before the characters because character spawns need its POIs. Only the
   * character models this team uses are loaded, plus the default model every missing one falls back to.
   * Shaders are compiled before the first frame, so `ready` resolves on a scene that renders smoothly.
   */
  private async init() {
    const loader = createSceneLoader()
    const [, officeGltf, characterModels] = await Promise.all([
      this.engine.init(),
      loader.load(OFFICE_MODEL_URL),
      loadCharacterModels(loader, this.characterModelsFor(this.team)),
    ])
    if (this.isDisposed) return

    this.worldManager.setup(officeGltf, this.team.color)
    this.characterManager.setup(characterModels)

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
        getAgentIndices: () => this.controller?.getAgentIndices() ?? [],
        getPosition: (agentIndex, out) => this.controller?.getCPUPosition(agentIndex, out) ?? false,
        getPois: () => this.poiManager.values(),
        isPointValid: (point) => this.navMesh.isPointOnNavMesh(point),
        onSelect: (agentIndex) => this.events.onAgentClick(agentIndex),
        onFloorClick: (x, z) => this.driverManager?.getPlayerDriver()?.onFloorClick(x, z),
        onHover: (agentIndex) => this.events.onAgentHover(agentIndex),
        onPoiHover: (id, label, position) => this.events.onPoiHover(id, label, position),
        onPoiClick: (id) => this.driverManager?.getPlayerDriver()?.onPoiClick(id),
      },
    )

    await this.engine.compile(this.stage.scene, this.stage.camera)
    if (this.isDisposed) return

    this.engine.renderer.setAnimationLoop(this.animate)
    const stillMissing = this.characterModelsFor(this.team).some(
      (modelId) => !this.characterManager.hasModel(modelId),
    )
    if (stillMissing) this.applyTeamChange()
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
    const busy = new Set(this.agentWork.busyAgentIndices)
    for (const driver of this.driverManager.npcDrivers()) {
      driver.setBusy(busy.has(driver.agentIndex))
      driver.setProjectDone(this.agentWork.isProjectDone)
    }
  }

  /** Executes one intent. Movement and chat intents are ignored until the characters exist. */
  public apply(intent: SceneIntent): void {
    switch (intent.type) {
      case "syncAgentWork":
        this.agentWork = intent.work
        this.syncDriverState()
        return
      case "goToDesk":
        this.setNpcWorking(intent.agentIndex, intent.deskSlot)
        return
      case "goToBoardroom":
        this.moveNpcToBoardroom(intent.agentIndex)
        return
      case "returnToSpawn":
        this.moveNpcToSpawn(intent.agentIndex)
        return
      case "setChatMode":
        this.isChatMode = intent.isChatting
        return
      case "startChat":
        this.startChatVisuals(intent.agentIndex)
        return
      case "updateChatTurn":
        this.updateChatTurn(intent.agentIndex, intent.isAgentSpeaking, intent.isUserSpeaking)
        return
      case "stopChat":
        this.stopChatVisuals(intent.agentIndex)
        return
      case "replaceTeam":
        this.team = intent.team
        this.applyTeamChange()
        return
      case "updateTeam":
        this.team = intent.team
        this.simulation?.updateSystem(intent.team)
        return
      case "layoutResizeStarted":
        this.isLayoutResizing = true
        return
      case "layoutResizeSettled":
        this.isLayoutResizing = false
        this.onResize()
        return
      case "setViewMode":
        this.isRenderingPaused = intent.viewMode === "design"
        return
    }
  }

  /** Sets the character the camera follows; null follows the user. */
  public followAgent(agentIndex: number | null): void {
    this.selectedIndex = agentIndex
  }

  /** The character models a team needs: the ones its characters use, plus the default fallback. */
  private characterModelsFor(team: AgenticSystem): string[] {
    const used = modelIdsUsedBy(team)
    return used.includes(DEFAULT_CHARACTER_MODEL_ID) ? used : [DEFAULT_CHARACTER_MODEL_ID, ...used]
  }

  /**
   * A different team, or agents added/removed. Character models the new team uses that are not
   * loaded yet are fetched first; if the team changes again meanwhile, the stale load is ignored.
   */
  private applyTeamChange() {
    const team = this.team
    const missing = this.characterModelsFor(team).filter(
      (modelId) => !this.characterManager.hasModel(modelId),
    )
    if (!this.controller || missing.length === 0) {
      this.rebuildForTeam(team)
      return
    }
    const loader = createSceneLoader()
    loadCharacterModels(loader, missing)
      .then((models) => {
        if (this.isDisposed || this.team !== team) return
        this.characterManager.addModels(models)
        this.rebuildForTeam(team)
      })
      .catch((error: unknown) => {
        console.error("[SceneManager] Character models failed to load:", error)
        if (!this.isDisposed && this.team === team) this.rebuildForTeam(team)
      })
  }

  /**
   * New simulation, characters and drivers for the team, everyone back at spawn. While still
   * loading, init() builds everything from this.team instead. Screen positions are cleared so a
   * removed agent's name bubble does not stay pinned where it last stood.
   */
  private rebuildForTeam(team: AgenticSystem) {
    this.simulation?.dispose()
    this.simulation = new AgentSimulation(team)
    this.worldManager.updateThemeColor(team.color)

    if (!this.controller) return
    this.controller.setTeam(team)
    clearScreenPositions()
    const roster = this.controller.getAgentIndices()
    if (this.selectedIndex !== null && !roster.includes(this.selectedIndex)) {
      this.selectedIndex = null
    }
    const pickedIndex = this.inputManager?.selectedIndex ?? null
    if (this.inputManager && pickedIndex !== null && !roster.includes(pickedIndex)) {
      this.inputManager.selectedIndex = null
    }
    this.registerDrivers()
    this.controller.warpAllToSpawn(
      team.user.index,
      getAllAgents(team).map((agent) => agent.index),
    )
  }

  /** Plays talk or listen on both sides of an open chat, unless one of them is still walking. */
  private updateChatTurn(npcIndex: number, isAgentSpeaking: boolean, isUserSpeaking: boolean) {
    const controller = this.controller
    if (!controller) return
    const user = this.team.user.index
    if (controller.getState(npcIndex) !== "walk")
      controller.play(npcIndex, isAgentSpeaking ? "talk" : "listen")
    controller.setSpeaking(npcIndex, isAgentSpeaking)
    if (controller.getState(user) !== "walk")
      controller.play(user, isUserSpeaking ? "talk" : "listen")
    controller.setSpeaking(user, isUserSpeaking)
  }

  /** Returns both sides of a closed chat to idle and lets the NPC wander again. */
  private stopChatVisuals(npcIndex: number | null) {
    const controller = this.controller
    if (!controller) return
    if (npcIndex !== null) {
      this.driverManager?.getNpcDriver(npcIndex)?.setChatting(false)
      controller.setSpeaking(npcIndex, false)
      controller.play(npcIndex, "idle")
      controller.poiManager.releaseAll(npcIndex)
    }
    const user = this.team.user.index
    controller.setSpeaking(user, false)
    controller.play(user, "idle")
    this.selectedIndex = null
  }

  /** Walks the player over to the NPC and turns the two to face each other. */
  private startChatVisuals(npcIndex: number): void {
    const controller = this.controller
    if (!controller) return
    const user = this.team.user.index
    const npc = new THREE.Vector3()
    const player = new THREE.Vector3()
    if (!controller.getCPUPosition(npcIndex, npc) || !controller.getCPUPosition(user, player))
      return
    npc.y = 0
    player.y = 0
    const direction = new THREE.Vector3().subVectors(player, npc).normalize()
    if (direction.length() < 0.01) direction.set(1, 0, 0)
    const target = npc.clone().addScaledVector(direction, CHAT_STANDOFF)

    this.selectedIndex = npcIndex
    this.driverManager?.getNpcDriver(npcIndex)?.setChatting(true)
    controller.cancelMovement(npcIndex)
    controller.play(npcIndex, "listen")
    controller.setFacing(npcIndex, direction.x, direction.z)
    this.driverManager?.getPlayerDriver()?.walkTo(target, "listen", () => {
      if (!controller.getCPUPosition(npcIndex, npc) || !controller.getCPUPosition(user, player)) {
        return
      }
      const facingX = npc.x - player.x
      const facingZ = npc.z - player.z
      controller.setFacing(user, facingX, facingZ)
      controller.setFacing(npcIndex, -facingX, -facingZ)
    })
  }

  /** False once disposed, when the agent loop is gone and a message has nowhere to go. */
  public get canSendMessages(): boolean {
    return this.simulation !== null
  }

  /** Hands the user's chat message to the agent's loop; resolves when the agent has replied. */
  public async sendUserMessage(agentIndex: number, text: string): Promise<void> {
    await this.simulation?.handleUserMessage(agentIndex, text)
  }

  /**
   * Sends the agent to its own desk (`deskPoiId`), or, if the office has none for it, to a
   * desk picked by its position on the team (`deskSlot`).
   */
  private setNpcWorking(index: number, deskSlot: number): void {
    if (!this.controller) return
    let poi = this.poiManager.getPoi(deskPoiId(index))
    if (!poi) {
      const desks = this.poiManager.getPoisOfKind("desk")
      if (desks.length > 0) poi = desks[deskSlot % desks.length]
    }
    if (poi) this.controller.walkToPoi(index, poi.id)
  }

  private moveNpcToBoardroom(index: number): void {
    if (!this.controller) return
    const poi = this.poiManager.getPoi(BOARDROOM_POI_ID)
    if (poi) this.controller.walkToPoi(index, poi.id)
  }

  private moveNpcToSpawn(index: number): void {
    if (!this.controller) return
    const poi = this.poiManager.getPoi(spawnPoiId(index))
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
    if (!this.isLayoutResizing) this.engine.onResize(width, height)
  }

  /**
   * One frame. Skipped in design mode, where the canvas is hidden behind the editor. Characters
   * step on the CPU, then paths, drivers and overlap fading react to this frame's positions
   * before the render.
   */
  private animate = () => {
    this.engine.timer.update()
    const deltaSeconds = Math.min(this.engine.timer.getDelta(), MAX_FRAME_DELTA)
    if (this.isRenderingPaused) return

    const controller = this.controller
    this.engine.trackFrame(deltaSeconds)
    this.stage.update()
    if (controller) {
      controller.update(deltaSeconds)
      controller.updatePaths()
      this.driverManager?.update(deltaSeconds)
      controller.updateOverlapFading(deltaSeconds)
    }

    const player = this.team.user.index
    const followed =
      controller?.getCPUPosition(this.selectedIndex ?? player, this.scratchPosition) ?? false
    this.stage.setFollowTarget(followed ? this.scratchPosition : null)
    if (controller) {
      const camera = this.stage.camera
      const bubblePosition = this.scratchPosition
      for (const agentIndex of controller.getAgentIndices()) {
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
      this.isChatMode,
      controller?.getAgentState(player) === AgentBehavior.GOTO,
    )
    this.engine.render(this.stage.scene, this.stage.camera)
  }

  /** Puts everyone back at spawn and releases the camera. Close any chat first. */
  public resetScene() {
    if (!this.controller) return
    const agents = getAllAgents(this.team)
    for (const agent of agents) this.controller.setSpeaking(agent.index, false)
    this.controller.warpAllToSpawn(
      this.team.user.index,
      agents.map((agent) => agent.index),
    )
    this.stage.setFollowTarget(null)
    this.stage.setChatMode(false, false)
  }

  /** Stops the render loop and the agent loop and releases every listener and GPU resource. Idempotent. */
  public dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
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
