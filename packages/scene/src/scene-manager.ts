import { OfficeAgent } from "@the-delegation/office-sim/agent"
import { isAgentState, statusColorOf } from "@the-delegation/office-sim/agent-states"
import type { OfficeExtras } from "@the-delegation/office-sim/office-extras"
import type { OfficeWorld } from "@the-delegation/office-sim/office-world"
import type { GLTF } from "three/addons/loaders/GLTFLoader.js"
import * as THREE from "three/webgpu"
import { OfficeCamera } from "./camera/office-camera"
import { Engine } from "./core/engine"
import type { FrameStats } from "./core/frame-profiler"
import { createSceneLoader } from "./loaders"
import { OfficeAmbient } from "./office/office-ambient"
import { OfficeLighting } from "./office/office-lighting"
import { prepareOfficeModel } from "./office/office-model"
import { loadOfficeWorld } from "./office/office-world-loader"
import { StatusLights } from "./office/status-lights"
import { applyOfficeTimeOfDay, TIME_OF_DAY_LOOKS } from "./office/time-of-day"
import { type PickTarget, RobotPicking } from "./robots/robot-picking"
import { RobotRig } from "./robots/robot-rig"
import type { SceneCast } from "./scene-cast"
import { disposeObjectTree } from "./scene-disposal"
import type { SceneIntent, TimeOfDay } from "./scene-intent"

/** Clamp so a long pause (hidden tab, design mode) doesn't teleport robots across the office. */
const MAX_FRAME_DELTA = 0.1

/** Paths of the models under the scene's asset base URL. */
const OFFICE_MODEL_PATH = "models/office.glb"
const ROBOT_MODEL_PATH = "models/robot.glb"

/** The office has five spawn points by the door; slot N spawns at spawn ((N - 1) mod 5) + 1. */
const SPAWN_POINT_COUNT = 5

/** What the scene reports back: clicks, accepted agent states, a lost GPU device, frame stats. */
export interface SceneEvents {
  /** A robot (its slot) or empty floor (null) was clicked. */
  onAgentClick(agentIndex: number | null): void
  /** A `setAgentState` was accepted: the robot is heading for the state, shown in `statusColor` (#rrggbb). */
  onAgentStatus(agentIndex: number, state: string, statusColor: string): void
  /** The GPU device is gone: this scene can no longer render and should be rebuilt. */
  onDeviceLost(): void
  /** Development only: a summary of recent frames, a few times a second. Omit to skip measuring. */
  onFrameStats?(stats: FrameStats): void
}

/** What the scene needs from the app that hosts it. */
export interface SceneOptions {
  /** Where the scene's models are served from, e.g. "/" for the site root. */
  assetBaseUrl: string
}

/** One robot in the office: what it looks like and how it moves. */
interface Robot {
  readonly agentIndex: number
  readonly rig: RobotRig
  readonly agent: OfficeAgent
}

/** Everything that exists once the models have loaded. */
interface LoadedOffice {
  readonly root: THREE.Object3D
  readonly extras: OfficeExtras
  readonly world: OfficeWorld
  readonly ambient: OfficeAmbient
  readonly statusLights: StatusLights
  readonly robotTemplate: GLTF
}

/**
 * The agent office in 3D: renders `office.glb` and one `robot.glb` per cast slot, and moves the
 * robots with office-sim agents as `setAgentState` intents arrive. It reads no store and decides
 * nothing about what a state means; the host drives it with intents and hears back through
 * `SceneEvents`. Intents that arrive before the models load are kept (the latest state per slot,
 * the latest cast and time of day) and applied once they have.
 */
export class SceneManager {
  private readonly engine: Engine
  private readonly scene = new THREE.Scene()
  private readonly background = new THREE.Color()
  private readonly officeCamera: OfficeCamera
  private readonly lighting: OfficeLighting
  private readonly resizeObserver: ResizeObserver
  private picking: RobotPicking | null = null
  private loadedGltfs: GLTF[] = []
  private office: LoadedOffice | null = null
  private readonly robots = new Map<number, Robot>()
  private readonly pendingStates = new Map<number, string>()

  private cast: SceneCast
  private timeOfDay: TimeOfDay = "day"
  private followedIndex: number | null = null
  private isRenderingPaused = false
  private isDisposed = false

  /** Resolves once the scene renders; rejects if WebGPU/WebGL2 or the models fail to load. */
  public readonly ready: Promise<void>

  constructor(
    private readonly container: HTMLElement,
    cast: SceneCast,
    private readonly events: SceneEvents,
    private readonly options: SceneOptions,
  ) {
    this.cast = cast
    this.engine = new Engine(
      container,
      () => {
        if (!this.isDisposed) this.events.onDeviceLost()
      },
      events.onFrameStats,
    )
    this.scene.background = this.background
    this.officeCamera = new OfficeCamera(this.engine.renderer.domElement)
    this.lighting = new OfficeLighting(this.scene)
    this.applyTimeOfDay()
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
    this.onResize()

    this.ready = this.init()
    this.ready.catch((error: unknown) => {
      if (!this.isDisposed) console.error("[SceneManager] Scene failed to load:", error)
    })
  }

  /**
   * Renderer start and both model downloads overlap; the office's world is built before the
   * robots, which spawn at its POIs. Shaders compile before the first frame, so `ready` resolves
   * on a scene that renders smoothly.
   */
  private async init(): Promise<void> {
    const loader = createSceneLoader(this.options.assetBaseUrl)
    const [, officeGltf, robotGltf] = await Promise.all([
      this.engine.init(),
      loader.load(OFFICE_MODEL_PATH),
      loader.load(ROBOT_MODEL_PATH),
    ])
    this.loadedGltfs = [officeGltf, robotGltf]
    if (this.isDisposed) {
      this.disposeLoadedModels()
      return
    }

    const root = officeGltf.scene
    const { extras, world } = loadOfficeWorld(root)
    prepareOfficeModel(root)
    this.office = {
      root,
      extras,
      world,
      ambient: new OfficeAmbient(root, officeGltf.animations),
      statusLights: new StatusLights(root, extras.statusColors),
      robotTemplate: robotGltf,
    }
    this.scene.add(root)
    this.officeCamera.setBounds(new THREE.Box3().setFromObject(root))
    this.applyTimeOfDay()
    this.syncRobots()
    for (const [agentIndex, state] of this.pendingStates) this.setAgentState(agentIndex, state)
    this.pendingStates.clear()
    this.picking = new RobotPicking(
      this.engine.renderer.domElement,
      this.officeCamera.camera,
      () => this.pickTargets(),
      (agentIndex) => this.events.onAgentClick(agentIndex),
    )

    await this.compileForEveryTimeOfDay()
    if (this.isDisposed) return
    this.engine.renderer.setAnimationLoop(this.animate)
  }

  /** Executes one intent; see `SceneIntent`. */
  public apply(intent: SceneIntent): void {
    if (this.isDisposed) return
    switch (intent.type) {
      case "setCast":
        this.cast = intent.cast
        this.syncRobots()
        return
      case "setAgentState":
        this.setAgentState(intent.agentIndex, intent.state)
        return
      case "setTimeOfDay":
        this.timeOfDay = intent.timeOfDay
        this.applyTimeOfDay()
        return
      case "setViewMode":
        this.isRenderingPaused = intent.viewMode === "design"
        return
    }
  }

  /** Eases the camera onto a robot and keeps it there as the robot moves; null returns to the overview. */
  public followAgent(agentIndex: number | null): void {
    if (this.isDisposed) return
    this.followedIndex = agentIndex
    if (agentIndex === null) this.officeCamera.showOverview()
    else this.officeCamera.startFollowing()
  }

  private setAgentState(agentIndex: number, state: string): void {
    const office = this.office
    if (!office) {
      this.pendingStates.set(agentIndex, state)
      return
    }
    if (!isAgentState(office.extras, state)) {
      console.warn(`[SceneManager] "${state}" is not an agent state of this office; ignored`)
      return
    }
    const robot = this.robots.get(agentIndex)
    if (!robot) {
      console.warn(`[SceneManager] slot ${agentIndex} has no robot in the cast; state ignored`)
      return
    }
    const statusColor = statusColorOf(office.extras, state)
    robot.agent.setState(state)
    robot.rig.setStatusColor(statusColor)
    office.statusLights.setSlotColor(agentIndex, statusColor)
    this.events.onAgentStatus(agentIndex, state, statusColor)
  }

  /**
   * Makes the robots match the cast: robots for slots that left are removed (their POIs freed and
   * their lights turned off), and each new slot gets a robot idling at its spawn point with no
   * state until the host gives it one. Slots the office has no pod and light for are ignored.
   */
  private syncRobots(): void {
    const office = this.office
    if (!office) return
    const slots = new Set(this.cast.agentIndices.filter((slot) => this.isValidSlot(office, slot)))
    for (const [agentIndex, robot] of this.robots) {
      if (slots.has(agentIndex)) continue
      robot.agent.release()
      robot.rig.dispose()
      office.statusLights.setSlotColor(agentIndex, null)
      this.robots.delete(agentIndex)
      if (this.followedIndex === agentIndex) this.followAgent(null)
    }
    for (const agentIndex of slots) {
      if (!this.robots.has(agentIndex)) this.addRobot(office, agentIndex)
    }
  }

  private isValidSlot(office: LoadedOffice, slot: number): boolean {
    const maxSlot = Math.min(office.extras.agents.max, office.statusLights.slotCount)
    if (Number.isInteger(slot) && slot >= 1 && slot <= maxSlot) return true
    console.warn(`[SceneManager] slot ${slot} is outside the office's slots 1 to ${maxSlot}`)
    return false
  }

  private addRobot(office: LoadedOffice, agentIndex: number): void {
    const rig = new RobotRig({
      scene: office.robotTemplate.scene,
      animations: office.robotTemplate.animations,
    })
    const agent = new OfficeAgent({
      id: agentIndex,
      desk: agentIndex,
      actor: rig.actor,
      world: office.world,
    })
    const spawn = office.world.poiNamed(
      `poi-idle-spawn-${((agentIndex - 1) % SPAWN_POINT_COUNT) + 1}`,
    )
    agent.spawnAt(spawn.x, spawn.z, spawn.yaw)
    agent.update(0)
    this.scene.add(rig.root)
    this.robots.set(agentIndex, { agentIndex, rig, agent })
  }

  private *pickTargets(): Iterable<PickTarget> {
    for (const robot of this.robots.values()) {
      yield { agentIndex: robot.agentIndex, position: robot.rig.root.position }
    }
  }

  /**
   * Compiles every shader for the other time of day, then for the current one, before the first
   * frame. The night lights change the set of lights every material is built for, so switching
   * later would otherwise stall on a recompile.
   */
  private async compileForEveryTimeOfDay(): Promise<void> {
    const otherTimeOfDay: TimeOfDay = this.timeOfDay === "day" ? "night" : "day"
    this.applyTimeOfDay(otherTimeOfDay)
    await this.engine.compile(this.scene, this.officeCamera.camera)
    if (this.isDisposed) return
    this.applyTimeOfDay()
    await this.engine.compile(this.scene, this.officeCamera.camera)
  }

  /** Applies a time of day (the current one by default) to the lights, background, exposure and office. */
  private applyTimeOfDay(timeOfDay: TimeOfDay = this.timeOfDay): void {
    const look = TIME_OF_DAY_LOOKS[timeOfDay]
    this.lighting.applyLook(look)
    this.background.set(look.background)
    this.engine.setExposure(look.exposure)
    if (this.office) applyOfficeTimeOfDay(this.office.root, timeOfDay)
  }

  private onResize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.officeCamera.resize(width, height)
    this.engine.onResize(width, height)
  }

  /**
   * One frame, skipped in design mode. Agents move and pose their robots first, then the mixers
   * animate them, so the camera follows where the robot is this frame.
   */
  private animate = () => {
    this.engine.timer.update()
    const deltaSeconds = Math.min(this.engine.timer.getDelta(), MAX_FRAME_DELTA)
    if (this.isRenderingPaused || this.isDisposed) return

    this.engine.trackFrame(deltaSeconds)
    for (const robot of this.robots.values()) {
      robot.agent.update(deltaSeconds)
      robot.rig.update(deltaSeconds)
    }
    this.office?.ambient.update(deltaSeconds)
    this.office?.statusLights.update(deltaSeconds)
    const followed =
      this.followedIndex === null ? null : this.robots.get(this.followedIndex)?.rig.root.position
    this.officeCamera.update(deltaSeconds, followed ?? null)
    this.engine.render(this.scene, this.officeCamera.camera)
  }

  private disposeLoadedModels(): void {
    for (const gltf of this.loadedGltfs) disposeObjectTree(gltf.scene)
    this.loadedGltfs = []
  }

  /** Stops the render loop and releases every listener, mixer and GPU resource. Idempotent. */
  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.engine.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.picking?.dispose()
    this.picking = null
    this.officeCamera.dispose()
    for (const robot of this.robots.values()) {
      robot.agent.release()
      robot.rig.dispose()
    }
    this.robots.clear()
    this.pendingStates.clear()
    if (this.office) {
      this.office.ambient.dispose()
      this.office.statusLights.dispose()
      this.office = null
    }
    this.disposeLoadedModels()
    this.lighting.dispose()
    this.engine.dispose()
  }
}
