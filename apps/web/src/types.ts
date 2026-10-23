import type * as THREE from "three/webgpu"

export enum AnimationName {
  IDLE = "Idle",
  WALK = "Walk",
  TALK = "Talk",
  LISTEN = "Listen",
  /** One-shot sit-down entry animation. */
  SIT_DOWN = "Sit",
  /** Loop: seated idle. */
  SIT_IDLE = "Sit_Idle",
  /** Loop: seated working. */
  SIT_WORK = "Sit_Work",
  LOOK_AROUND = "LookAround",
  HAPPY = "Happy",
  SAD = "Sad",
  PICK = "Pick",
  WAVE = "Wave",
}

/** Stored as a float in the GPU agent buffer (.w component). */
export enum AgentBehavior {
  /** Position locked, velocity zero, facing follows the waypoint field (if non-zero). */
  IDLE = 0,
  /** Moves toward the target waypoint (.x/.z of the agent buffer). */
  GOTO = 1,
  /** Position locked, velocity zero: the character is seated, treated like IDLE by the movement step. */
  SEATED = 2,
}

/**
 * High-level character state keys understood by the state machine.
 * Each maps declaratively to an animation + optional expression.
 * `sit_down` is a one-shot entry animation that auto-transitions to `sit_idle`; `sit_idle` and
 * `sit_work` loop; `happy_loop` and `wave_loop` are looping versions with no auto-transition.
 */
export type CharacterStateKey =
  | "idle"
  | "walk"
  | "talk"
  | "listen"
  | "sit_down"
  | "sit_idle"
  | "sit_work"
  | "look_around"
  | "happy"
  | "happy_loop"
  | "sad"
  | "pick"
  | "wave"
  | "wave_loop"

/**
 * Declarative definition of a character state.
 * Adding a new state = adding one entry to STATE_MAP, no logic changes required.
 */
export interface CharacterStateDef {
  /** GPU animation to play. */
  animation: AnimationName
  /** Facial expression to set when entering this state. Undefined = keep current. */
  expression?: ExpressionKey
  /** True = animation loops forever. False = plays once then auto-transitions. */
  loop: boolean
  /** Override the clip duration (seconds). Only used when loop=false. */
  durationOverride?: number
  /** State to enter automatically after a non-looping animation finishes. */
  nextState?: CharacterStateKey
  /**
   * Whether external callers can interrupt this state with a new one.
   * Non-interruptible states (e.g. 'sit_down' entry) must finish before new commands apply.
   */
  interruptible: boolean
}

export interface PoiDef {
  id: string
  /** World-space position to walk toward. */
  position: THREE.Vector3
  /** World-space quaternion for orientation. */
  quaternion: THREE.Quaternion
  /** State to enter upon arrival. */
  arrivalState: CharacterStateKey
  /** Agent index currently occupying this POI, or null if free. */
  occupiedBy: number | null
  /** Optional label to show on hover (e.g. "Sit down"). */
  label?: string
}

/**
 * Low-level rendering/GPU interface that behavior drivers call.
 * Decouples BehaviorManager and StateMachine from concrete CharacterManager.
 */
export interface ICharacterDriver {
  setPhysicsMode(index: number, mode: AgentBehavior): void
  setAnimation(index: number, name: AnimationName, loop?: boolean): void
  setExpression(index: number, key: ExpressionKey): void
  setSpeaking(index: number, isSpeaking: boolean): void
  getAgentState(index: number): AgentBehavior
  getAnimationDuration(index: number, name: AnimationName): number
}

/**
 * High-level interface for per-agent behavior drivers
 * (PlayerInputDriver, NpcAgentDriver, etc.)
 */
export interface IAgentDriver {
  readonly agentIndex: number
  update(deltaSeconds: number): void
  dispose(): void
}

export type ExpressionKey =
  | "idle"
  | "listening"
  | "neutral"
  | "surprised"
  | "happy"
  | "sick"
  | "wink"
  | "doubtful"
  | "sad"

export interface AtlasCoords {
  col: number
  row: number
}
