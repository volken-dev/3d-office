import type { Actor, PlayOptions } from "../../src/agent"

/** Clip lengths the fake actor reports, close to robot.glb's. */
export const FAKE_CLIP_DURATIONS: Readonly<Record<string, number>> = {
  Sit: 0.8,
  Stand: 0.8,
  Plug_In: 0.6,
  Plug_Out: 0.6,
}

/** An actor that records what the agent asked of it, for asserting clip sequences. */
export class FakeActor implements Actor {
  readonly plays: { clip: string; options: PlayOptions }[] = []
  x = 0
  z = 0
  yaw = 0

  setPose(x: number, z: number, yaw: number): void {
    this.x = x
    this.z = z
    this.yaw = yaw
  }

  play(clip: string, options: PlayOptions): void {
    this.plays.push({ clip, options })
  }

  duration(clip: string): number {
    return FAKE_CLIP_DURATIONS[clip] ?? 0
  }

  /** The clips played so far, in order. */
  get clips(): string[] {
    return this.plays.map((played) => played.clip)
  }
}
