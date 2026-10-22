import {
  AnimationName,
  type CharacterStateDef,
  type CharacterStateKey,
  type ICharacterDriver,
} from "../../types"

/**
 * Declarative definition of every character state.
 * To add a new state: add an entry here. No logic changes needed elsewhere.
 *
 *  loop: true  → animation loops; state persists until an explicit transition.
 *  loop: false → animation plays once, then auto-transitions to `nextState`.
 *  interruptible: false → the state machine will NOT apply a new state until the
 *                         current animation finishes.
 */
const STATE_MAP: Record<CharacterStateKey, CharacterStateDef> = {
  idle: { animation: AnimationName.IDLE, expression: "idle", loop: true, interruptible: true },
  walk: { animation: AnimationName.WALK, loop: true, interruptible: true },
  talk: { animation: AnimationName.TALK, expression: "neutral", loop: true, interruptible: true },
  listen: {
    animation: AnimationName.LISTEN,
    expression: "listening",
    loop: true,
    interruptible: true,
  },
  sit_down: {
    animation: AnimationName.SIT_DOWN,
    loop: false,
    nextState: "sit_idle",
    interruptible: false,
  },
  sit_idle: {
    animation: AnimationName.SIT_IDLE,
    expression: "idle",
    loop: true,
    interruptible: true,
  },
  sit_work: {
    animation: AnimationName.SIT_WORK,
    expression: "idle",
    loop: true,
    interruptible: true,
  },
  look_around: {
    animation: AnimationName.LOOK_AROUND,
    expression: "surprised",
    loop: false,
    nextState: "idle",
    interruptible: true,
  },
  happy: {
    animation: AnimationName.HAPPY,
    expression: "happy",
    loop: false,
    nextState: "idle",
    interruptible: true,
  },
  sad: {
    animation: AnimationName.SAD,
    expression: "sad",
    loop: false,
    nextState: "idle",
    interruptible: true,
  },
  pick: { animation: AnimationName.PICK, loop: false, nextState: "idle", interruptible: false },
  wave: { animation: AnimationName.WAVE, loop: false, nextState: "idle", interruptible: true },
  wave_loop: { animation: AnimationName.WAVE, loop: true, interruptible: true },
  happy_loop: {
    animation: AnimationName.HAPPY,
    expression: "happy",
    loop: true,
    interruptible: true,
  },
}

/** True when a name read from outside the code (e.g. a GLB POI name) is a declared character state. */
export function isCharacterStateKey(name: string): name is CharacterStateKey {
  return Object.hasOwn(STATE_MAP, name)
}

/**
 * Per-character animation/expression state, driven from STATE_MAP so behaviour is declared as data
 * and one-shot animations hand back to a follow-up state on their own.
 */
export class CharacterStateMachine {
  /** Current state key per agent index. */
  private currentState: CharacterStateKey[] = []
  /** Countdown timer for non-looping states (seconds remaining). */
  private stateTimer: number[] = []
  /**
   * Explicit sit target — set via prepareSitDown() before entering sit_down.
   * When the sit_down animation finishes this state is applied directly,
   * bypassing the generic pendingState / nextState mechanism.
   */
  private sitTarget: (CharacterStateKey | null)[] = []

  constructor(private readonly count: number) {
    for (let i = 0; i < count; i++) {
      this.currentState[i] = "idle"
      this.stateTimer[i] = 0
      this.sitTarget[i] = null
    }
  }

  /**
   * Store the desired final seated state BEFORE calling transition('sit_down').
   * The state machine will apply this state once the sit_down animation finishes,
   * regardless of timing between the async arrival callback and the sync update loop.
   */
  public prepareSitDown(index: number, finalState: "sit_idle" | "sit_work"): void {
    this.sitTarget[index] = finalState
  }

  /**
   * Request a state transition. A running non-interruptible state ignores every request except
   * walk, which always wins so a click never feels ignored.
   */
  public transition(index: number, newState: CharacterStateKey, driver: ICharacterDriver): void {
    const currentDefinition = STATE_MAP[this.currentState[index]]
    if (!currentDefinition.interruptible && this.stateTimer[index] > 0 && newState !== "walk")
      return

    this._applyState(index, newState, driver)
  }

  /** Returns the current state key for an agent. */
  public getState(index: number): CharacterStateKey {
    return this.currentState[index]
  }

  /**
   * Called every frame. Processes timers for non-looping animations and fires auto-transitions
   * when they expire. sitTarget is only consumed when sit_down finishes, so a stale value from a
   * leaked prepareSitDown call never redirects another non-looping state.
   */
  public update(deltaSeconds: number, driver: ICharacterDriver): void {
    for (let agentIndex = 0; agentIndex < this.count; agentIndex++) {
      const stateDefinition = STATE_MAP[this.currentState[agentIndex]]
      if (stateDefinition.loop) continue

      this.stateTimer[agentIndex] -= deltaSeconds
      if (this.stateTimer[agentIndex] <= 0) {
        const isSitDown = this.currentState[agentIndex] === "sit_down"
        const nextState =
          (isSitDown ? this.sitTarget[agentIndex] : null) ?? stateDefinition.nextState ?? "idle"
        if (isSitDown) this.sitTarget[agentIndex] = null
        this._applyState(agentIndex, nextState, driver)
      }
    }
  }

  private _applyState(index: number, key: CharacterStateKey, driver: ICharacterDriver): void {
    const stateDefinition = STATE_MAP[key]
    if (!stateDefinition) {
      console.warn(`[CharacterStateMachine] Unknown state: "${key}"`)
      return
    }

    this.currentState[index] = key

    driver.setAnimation(index, stateDefinition.animation, stateDefinition.loop)

    if (stateDefinition.expression !== undefined) {
      driver.setExpression(index, stateDefinition.expression)
    }

    if (!stateDefinition.loop) {
      const duration =
        stateDefinition.durationOverride ??
        driver.getAnimationDuration(index, stateDefinition.animation)
      this.stateTimer[index] = duration > 0 ? duration : 1.0
    }
  }
}
