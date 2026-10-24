import { afterEach, describe, expect, spyOn, test } from "bun:test"
import * as THREE from "three/webgpu"
import { ThreeActor } from "../../src/robots/three-actor"

/** A clip moving the `box` node along x from 0 to `to` over `duration` seconds. */
function slideClip(name: string, duration: number, to: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack("box.position", [0, duration], [0, 0, 0, to, 0, 0]),
  ])
}

function clipNamed(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((candidate) => candidate.name === name)
  if (!clip) throw new Error(`no clip ${name}`)
  return clip
}

function tinyRobot() {
  const root = new THREE.Group()
  const box = new THREE.Object3D()
  box.name = "box"
  root.add(box)
  const mixer = new THREE.AnimationMixer(root)
  const clips = [slideClip("Idle", 1, 1), slideClip("Sit", 0.5, 2), slideClip("Walk", 0.4, 3)]
  const actor = new ThreeActor(root, mixer, clips, () => 0.5)
  return { root, box, mixer, clips, actor }
}

afterEach(() => {
  spyOn(console, "warn").mockRestore()
})

describe("ThreeActor", () => {
  test("poses the root on the floor facing the yaw", () => {
    const { root, actor } = tinyRobot()
    actor.setPose(2, -3, Math.PI / 2)
    expect(root.position.toArray()).toEqual([2, 0, -3])
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  test("reports clip lengths, 0 for a clip it lacks", () => {
    const { actor } = tinyRobot()
    expect(actor.duration("Sit")).toBe(0.5)
    expect(actor.duration("Dance")).toBe(0)
  })

  test("a loop started with no fade cuts in at a random time and repeats", () => {
    const { mixer, clips, actor } = tinyRobot()
    actor.play("Walk", { fade: 0.2 })
    actor.play("Idle", { fade: 0 })
    const idle = actor.current
    expect(idle?.getClip().name).toBe("Idle")
    expect(idle?.loop).toBe(THREE.LoopRepeat)
    expect(idle?.time).toBeCloseTo(0.5)
    const walk = mixer.existingAction(clipNamed(clips, "Walk"))
    expect(walk?.isRunning()).toBe(false)
    mixer.update(3)
    expect(idle?.isRunning()).toBe(true)
  })

  test("a one-shot plays once and holds its last frame after crossfading in", () => {
    const { box, mixer, clips, actor } = tinyRobot()
    actor.play("Idle", { fade: 0 })
    mixer.update(0.1)
    actor.play("Sit", { once: true, fade: 0.2 })
    const sit = actor.current
    expect(sit?.loop).toBe(THREE.LoopOnce)
    expect(sit?.clampWhenFinished).toBe(true)
    mixer.update(0.1)
    const idle = mixer.existingAction(clipNamed(clips, "Idle"))
    expect(idle?.getEffectiveWeight()).toBeLessThan(1)
    expect(idle?.getEffectiveWeight()).toBeGreaterThan(0)
    mixer.update(0.2)
    mixer.update(1)
    expect(idle?.isRunning()).toBe(false)
    expect(sit?.paused).toBe(true)
    expect(box.position.x).toBeCloseTo(2)
    mixer.update(1)
    expect(box.position.x).toBeCloseTo(2)
  })

  test("a one-shot played again restarts from its first frame", () => {
    const { box, mixer, actor } = tinyRobot()
    actor.play("Sit", { once: true, fade: 0 })
    mixer.update(1)
    expect(box.position.x).toBeCloseTo(2)
    actor.play("Sit", { once: true, fade: 0 })
    mixer.update(0.25)
    expect(box.position.x).toBeCloseTo(1)
  })

  test("an unknown clip is ignored with a warning", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    const { actor } = tinyRobot()
    actor.play("Idle", { fade: 0 })
    const idle = actor.current
    actor.play("Dance", { fade: 0.2 })
    expect(actor.current).toBe(idle)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
