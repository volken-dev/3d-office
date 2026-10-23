import {
  AnimationName,
  type CharacterStateDef,
  type CharacterStateKey,
  type ICharacterDriver,
} from "../scene-types"

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

/**
 * Per-character animation/expression state, driven from STATE_MAP so behaviour is declared as data
 * and one-shot animations hand back to a follow-up state on their own.
 */
export class CharacterStateMachine {
  /** Current state key per agent index. */
  private readonly currentState = new Map<number, CharacterStateKey>()
  /** Countdown timer for non-looping states (seconds remaining). */
  private readonly stateTimer = new Map<number, number>()
  /**
   * Explicit sit target — set via prepareSitDown() before entering sit_down.
   * When the sit_down animation finishes this state is applied directly,
   * bypassing the generic pendingState / nextState mechanism.
   */
  private readonly sitTarget = new Map<number, CharacterStateKey>()

  /** Every character starts idle. Indices not listed here are ignored. */
  constructor(agentIndices: readonly number[]) {
    for (const agentIndex of agentIndices) {
      this.currentState.set(agentIndex, "idle")
      this.stateTimer.set(agentIndex, 0)
    }
  }

  /**
   * Store the desired final seated state BEFORE calling transition('sit_down').
   * The state machine will apply this state once the sit_down animation finishes,
   * regardless of timing between the async arrival callback and the sync update loop.
   */
  public prepareSitDown(index: number, finalState: "sit_idle" | "sit_work"): void {
    if (this.currentState.has(index)) this.sitTarget.set(index, finalState)
  }

  /**
   * Request a state transition. A running non-interruptible state ignores every request except
   * walk, which always wins so a click never feels ignored.
   */
  public transition(index: number, newState: CharacterStateKey, driver: ICharacterDriver): void {
    const currentState = this.currentState.get(index)
    if (currentState === undefined) return
    const currentDefinition = STATE_MAP[currentState]
    const timer = this.stateTimer.get(index) ?? 0
    if (!currentDefinition.interruptible && timer > 0 && newState !== "walk") return

    this._applyState(index, newState, driver)
  }

  /** Returns the current state key for an agent; idle for an agent without a character. */
  public getState(index: number): CharacterStateKey {
    return this.currentState.get(index) ?? "idle"
  }

  /**
   * Called every frame. Processes timers for non-looping animations and fires auto-transitions
   * when they expire. sitTarget is only consumed when sit_down finishes, so a stale value from a
   * leaked prepareSitDown call never redirects another non-looping state.
   */
  public update(deltaSeconds: number, driver: ICharacterDriver): void {
    for (const [agentIndex, currentState] of this.currentState) {
      const stateDefinition = STATE_MAP[currentState]
      if (stateDefinition.loop) continue

      const timer = (this.stateTimer.get(agentIndex) ?? 0) - deltaSeconds
      this.stateTimer.set(agentIndex, timer)
      if (timer <= 0) {
        const isSitDown = currentState === "sit_down"
        const nextState =
          (isSitDown ? this.sitTarget.get(agentIndex) : undefined) ??
          stateDefinition.nextState ??
          "idle"
        if (isSitDown) this.sitTarget.delete(agentIndex)
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

    this.currentState.set(index, key)

    driver.setAnimation(index, stateDefinition.animation, stateDefinition.loop)

    if (stateDefinition.expression !== undefined) {
      driver.setExpression(index, stateDefinition.expression)
    }

    if (!stateDefinition.loop) {
      const duration =
        stateDefinition.durationOverride ??
        driver.getAnimationDuration(index, stateDefinition.animation)
      this.stateTimer.set(index, duration > 0 ? duration : 1.0)
    }
  }
}
