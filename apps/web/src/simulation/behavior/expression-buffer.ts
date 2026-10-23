import {
  ATLAS_COLS,
  ATLAS_ROWS,
  BLINK_DURATION,
  BLINK_FRAME,
  BLINK_INTERVAL_MIN,
  BLINK_INTERVAL_RANGE,
  SPEAKING_FRAME_DURATION,
} from "../constants"
import type { AtlasCoords, ExpressionKey } from "../scene-types"
import { Vec4Texture } from "../vec4-texture"

const EXPRESSIONS: Record<ExpressionKey, { eyes: AtlasCoords; mouth: AtlasCoords }> = {
  idle: { eyes: { col: 0, row: 3 }, mouth: { col: 1, row: 3 } },
  listening: { eyes: { col: 1, row: 0 }, mouth: { col: 1, row: 1 } },
  neutral: { eyes: { col: 0, row: 3 }, mouth: { col: 1, row: 2 } },
  surprised: { eyes: { col: 0, row: 2 }, mouth: { col: 0, row: 2 } },
  happy: { eyes: { col: 1, row: 2 }, mouth: { col: 0, row: 3 } },
  sick: { eyes: { col: 0, row: 1 }, mouth: { col: 0, row: 1 } },
  wink: { eyes: { col: 0, row: 0 }, mouth: { col: 0, row: 0 } },
  doubtful: { eyes: { col: 1, row: 0 }, mouth: { col: 0, row: 2 } },
  sad: { eyes: { col: 1, row: 1 }, mouth: { col: 1, row: 0 } },
}

const SPEAKING_MOUTH_FRAMES: AtlasCoords[] = [
  { col: 1, row: 3 },
  { col: 0, row: 3 },
  { col: 1, row: 2 },
  { col: 0, row: 2 },
]

/**
 * CPU/GPU buffer that stores per-instance expression data.
 * Each instance maps to one vec4:
 *   .x = eye X offset
 *   .y = eye Y offset
 *   .z = mouth X offset
 *   .w = mouth Y offset
 */
export class ExpressionBuffer {
  public readonly array: Float32Array
  /** GPU copy of `array`, one vec4 record per instance. */
  public readonly texture: Vec4Texture

  private speakingStates: boolean[] = []
  private speakingFrames: number[] = []
  private speakingTimers: number[] = []
  private blinkTimers: number[] = []
  private isBlinking: boolean[] = []
  private currentExpressions: ExpressionKey[] = []

  constructor(private readonly count: number) {
    this.texture = new Vec4Texture(count)
    this.array = this.texture.array

    for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
      this.speakingStates[instanceIndex] = false
      this.speakingFrames[instanceIndex] = 0
      this.speakingTimers[instanceIndex] = 0
      this.blinkTimers[instanceIndex] = BLINK_INTERVAL_MIN + Math.random() * BLINK_INTERVAL_RANGE
      this.isBlinking[instanceIndex] = false
      this.setExpression(instanceIndex, "idle")
    }
  }

  public setExpression(index: number, name: ExpressionKey) {
    this.currentExpressions[index] = name
    const config = EXPRESSIONS[name] || EXPRESSIONS.idle

    if (!this.isBlinking[index]) {
      this.setEyeOffset(index, config.eyes)
    }

    if (!this.speakingStates[index]) {
      this.setMouthOffset(index, config.mouth)
    }
  }

  public setSpeaking(index: number, isSpeaking: boolean) {
    this.speakingStates[index] = isSpeaking
    if (!isSpeaking) {
      const config = EXPRESSIONS[this.currentExpressions[index]] || EXPRESSIONS.idle
      this.setMouthOffset(index, config.mouth)
    }
  }

  private setEyeOffset(index: number, coords: AtlasCoords) {
    this.array[index * 4 + 0] = coords.col * (1 / ATLAS_COLS)
    this.array[index * 4 + 1] = 1.0 - (coords.row + 1) * (1 / ATLAS_ROWS)
    this.texture.markChanged()
  }

  private setMouthOffset(index: number, coords: AtlasCoords) {
    this.array[index * 4 + 2] = coords.col * (1 / ATLAS_COLS)
    this.array[index * 4 + 3] = 1.0 - (coords.row + 1) * (1 / ATLAS_ROWS)
    this.texture.markChanged()
  }

  public update(deltaSeconds: number) {
    let needsUpdate = false

    for (let instanceIndex = 0; instanceIndex < this.count; instanceIndex++) {
      this.blinkTimers[instanceIndex] -= deltaSeconds
      if (this.blinkTimers[instanceIndex] <= 0) {
        if (!this.isBlinking[instanceIndex]) {
          this.isBlinking[instanceIndex] = true
          this.blinkTimers[instanceIndex] = BLINK_DURATION
          this.setEyeOffset(instanceIndex, BLINK_FRAME)
          needsUpdate = true
        } else {
          this.isBlinking[instanceIndex] = false
          this.blinkTimers[instanceIndex] =
            BLINK_INTERVAL_MIN + Math.random() * BLINK_INTERVAL_RANGE
          const config = EXPRESSIONS[this.currentExpressions[instanceIndex]] || EXPRESSIONS.idle
          this.setEyeOffset(instanceIndex, config.eyes)
          needsUpdate = true
        }
      }

      if (this.speakingStates[instanceIndex]) {
        this.speakingTimers[instanceIndex] -= deltaSeconds
        if (this.speakingTimers[instanceIndex] <= 0) {
          this.speakingTimers[instanceIndex] = SPEAKING_FRAME_DURATION
          this.speakingFrames[instanceIndex] =
            (this.speakingFrames[instanceIndex] + 1) % SPEAKING_MOUTH_FRAMES.length
          this.setMouthOffset(
            instanceIndex,
            SPEAKING_MOUTH_FRAMES[this.speakingFrames[instanceIndex]],
          )
          needsUpdate = true
        }
      }
    }

    if (needsUpdate) {
      this.texture.markChanged()
    }
  }

  public dispose(): void {
    this.texture.dispose()
  }
}
