import * as THREE from "three/webgpu"
import { CharacterController } from "./character-controller"
import { DEFAULT_CHARACTER_MODEL_ID } from "./characters/character-models"
import { loadCharacterModels } from "./characters/load-character-models"
import { BUBBLE_Y_OFFSET, CHAT_STANDOFF, OFFICE_MODEL_PATH } from "./constants"
import { Engine } from "./core/engine"
import type { FrameStats } from "./core/frame-profiler"
import { Stage } from "./core/stage"
import { DriverManager } from "./drivers/driver-manager"
import { CharacterManager } from "./entities/character-manager"
import { InputManager } from "./input/input-manager"
import { createSceneLoader } from "./loaders"
import { NavMeshManager } from "./pathfinding/nav-mesh-manager"
import { loadNavigationRuntime } from "./pathfinding/navigation-runtime"
import { modelIdsUsedBy, nonPlayerMembers, type SceneCast, userIndexOf } from "./scene-cast"
import type { AgentWork, SceneIntent } from "./scene-intent"
import { AgentBehavior } from "./scene-types"
import type { ScreenPositionSink } from "./screen-position-sink"
import { BOARDROOM_POI_ID, deskPoiId, spawnPoiId } from "./world/poi-ids"
import { PoiManager } from "./world/poi-manager"
import { WorldManager } from "./world/world-manager"

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
  /** Development only: a summary of recent frames, a few times a second. Omit to skip measuring. */
  onFrameStats?(stats: FrameStats): void
}

/** What the scene needs from the app that hosts it. */
export interface SceneOptions {
  /** Where the scene's models are served from, e.g. "/" for the site root. */
  assetBaseUrl: string
  screenPositions: ScreenPositionSink
}

/**
 * Owns the 3D office for a cast and executes scene intents (movement,
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

  private cast: SceneCast
  /** The user's character index in the current cast, kept so the render loop never searches for it. */
  private playerIndex: number
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

  constructor(
    container: HTMLElement,
    cast: SceneCast,
    events: SceneEvents,
    private readonly options: SceneOptions,
  ) {
    this.container = container
    this.viewportWidth = container.clientWidth
    this.viewportHeight = container.clientHeight
    this.cast = cast
    this.playerIndex = userIndexOf(cast)
    this.events = events

    this.engine = new Engine(
      container,
      () => {
        if (!this.isDisposed) this.events.onDeviceLost()
      },
      events.onFrameStats,
    )
    this.stage = new Stage(this.engine.renderer.domElement)
    this.characterManager = new CharacterManager(this.stage.scene, this.cast)
    this.navMesh = new NavMeshManager()
    this.poiManager = new PoiManager()
    this.characterManager.setPoiManager(this.poiManager)
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager)

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)

    this.ready = this.init()
    this.ready.catch((error) => {
      if (!this.isDisposed) console.error("[SceneManager] Scene failed to load:", error)
    })
  }

  /**
   * Renderer init, the navigation runtime and every model download/decode overlap; only the setup
   * after them is ordered.
   * The world is set up before the characters because character spawns need its POIs. Only the
   * character models this cast uses are loaded, plus the default model every missing one falls back to.
   * Shaders are compiled before the first frame, so `ready` resolves on a scene that renders smoothly.
   */
  private async init() {
    const loader = createSceneLoader(this.options.assetBaseUrl)
    const [, , officeGltf, characterModels] = await Promise.all([
      this.engine.init(),
      loadNavigationRuntime(),
      loader.load(OFFICE_MODEL_PATH),
      loadCharacterModels(loader, this.characterModelsFor(this.cast)),
    ])
    if (this.isDisposed) return

    this.worldManager.setup(officeGltf, this.cast.themeColor)
    this.characterManager.setup(characterModels)

    this.controller = new CharacterController(
      this.characterManager,
      this.navMesh,
      this.poiManager,
      this.playerIndex,
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
    const stillMissing = this.characterModelsFor(this.cast).some(
      (modelId) => !this.characterManager.hasModel(modelId),
    )
    if (stillMissing) this.applyTeamChange()
  }

  private registerDrivers() {
    if (!this.driverManager) return
    this.driverManager.dispose()
    this.driverManager.registerPlayer(this.playerIndex)
    for (const member of nonPlayerMembers(this.cast)) {
      this.driverManager.registerNpc(member.index, member.role === "lead")
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
        this.setCurrentCast(intent.cast)
        this.applyTeamChange()
        return
      case "updateTeam":
        this.setCurrentCast(intent.cast)
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

  private setCurrentCast(cast: SceneCast) {
    this.cast = cast
    this.playerIndex = userIndexOf(cast)
  }

  /** The character models a cast needs: the ones its characters use, plus the default fallback. */
  private characterModelsFor(cast: SceneCast): string[] {
    const used = modelIdsUsedBy(cast)
    return used.includes(DEFAULT_CHARACTER_MODEL_ID) ? used : [DEFAULT_CHARACTER_MODEL_ID, ...used]
  }

  /**
   * A different team, or agents added/removed. Character models the new team uses that are not
   * loaded yet are fetched first; if the team changes again meanwhile, the stale load is ignored.
   */
  private applyTeamChange() {
    const cast = this.cast
    const missing = this.characterModelsFor(cast).filter(
      (modelId) => !this.characterManager.hasModel(modelId),
    )
    if (!this.controller || missing.length === 0) {
      this.rebuildForCast(cast)
      return
    }
    const loader = createSceneLoader(this.options.assetBaseUrl)
    loadCharacterModels(loader, missing)
      .then((models) => {
        if (this.isDisposed || this.cast !== cast) return
        this.characterManager.addModels(models)
        this.rebuildForCast(cast)
      })
      .catch((error: unknown) => {
        console.error("[SceneManager] Character models failed to load:", error)
        if (!this.isDisposed && this.cast === cast) this.rebuildForCast(cast)
      })
  }

  /**
   * New characters and drivers for the team, everyone back at spawn. While still
   * loading, init() builds everything from this.cast instead. Screen positions are cleared so a
   * removed agent's name bubble does not stay pinned where it last stood.
   */
  private rebuildForCast(cast: SceneCast) {
    this.worldManager.updateThemeColor(cast.themeColor)

    if (!this.controller) return
    this.controller.setCast(cast)
    this.options.screenPositions.clear()
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
      userIndexOf(cast),
      nonPlayerMembers(cast).map((member) => member.index),
    )
  }

  /** Plays talk or listen on both sides of an open chat, unless one of them is still walking. */
  private updateChatTurn(npcIndex: number, isAgentSpeaking: boolean, isUserSpeaking: boolean) {
    const controller = this.controller
    if (!controller) return
    const user = this.playerIndex
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
    const user = this.playerIndex
    controller.setSpeaking(user, false)
    controller.play(user, "idle")
    this.selectedIndex = null
  }

  /** Walks the player over to the NPC and turns the two to face each other. */
  private startChatVisuals(npcIndex: number): void {
    const controller = this.controller
    if (!controller) return
    const user = this.playerIndex
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
   * One frame. Skipped in design mode, where the canvas is hidden behind the editor. The crowd
   * moves the characters on the CPU, then drivers and overlap fading react to this frame's
   * positions before the render.
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
      this.driverManager?.update(deltaSeconds)
      controller.updateOverlapFading(deltaSeconds)
    }

    const player = this.playerIndex
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
        this.options.screenPositions.set(
          agentIndex,
          (bubblePosition.x * 0.5 + 0.5) * this.viewportWidth,
          (bubblePosition.y * -0.5 + 0.5) * this.viewportHeight,
        )
      }
      this.options.screenPositions.notify()
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
    const agents = nonPlayerMembers(this.cast)
    for (const agent of agents) this.controller.setSpeaking(agent.index, false)
    this.controller.warpAllToSpawn(
      this.playerIndex,
      agents.map((agent) => agent.index),
    )
    this.stage.setFollowTarget(null)
    this.stage.setChatMode(false, false)
  }

  /** Stops the render loop and releases every listener and GPU resource. Idempotent. */
  public dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.inputManager?.dispose()
    this.inputManager = null
    this.resizeObserver.disconnect()
    this.driverManager?.dispose()
    this.controller?.dispose()
    this.navMesh.dispose()
    this.stage.dispose()
    this.characterManager.dispose()
    this.worldManager.dispose()
    this.engine.dispose()
    this.options.screenPositions.clear()
  }
}
