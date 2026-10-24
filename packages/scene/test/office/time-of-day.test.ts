import { describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import { applyOfficeTimeOfDay, TIME_OF_DAY_LOOKS } from "../../src/office/time-of-day"

function named<Named extends { name: string }>(node: Named, name: string): Named {
  node.name = name
  return node
}

function syntheticOffice() {
  const lampGlow = named(new THREE.MeshStandardMaterial(), "lamp_glow")
  const floor = named(new THREE.MeshStandardMaterial({ emissiveIntensity: 0.7 }), "floor_lab")
  const daySky = named(new THREE.Mesh(new THREE.PlaneGeometry()), "day-only-sky")
  const nightSky = named(new THREE.Mesh(new THREE.PlaneGeometry()), "night-only-sky")
  const deskLight = named(new THREE.PointLight(), "night-light-desks")
  const otherLight = named(new THREE.PointLight(), "work-lamp")
  const lamp = named(new THREE.Mesh(new THREE.BoxGeometry(), [lampGlow, floor]), "static-lamps")
  const root = new THREE.Group()
  const group = new THREE.Group()
  group.add(nightSky, deskLight)
  root.add(daySky, group, otherLight, lamp)
  return { root, lampGlow, floor, daySky, nightSky, deskLight, otherLight }
}

describe("applyOfficeTimeOfDay", () => {
  test("night shows the night-only nodes and lights and raises lamp_glow", () => {
    const office = syntheticOffice()
    applyOfficeTimeOfDay(office.root, "night")
    expect(office.daySky.visible).toBe(false)
    expect(office.nightSky.visible).toBe(true)
    expect(office.deskLight.visible).toBe(true)
    expect(office.lampGlow.emissiveIntensity).toBe(TIME_OF_DAY_LOOKS.night.lampGlowIntensity)
    expect(office.floor.emissiveIntensity).toBe(0.7)
    expect(office.otherLight.visible).toBe(true)
  })

  test("day does the reverse", () => {
    const office = syntheticOffice()
    applyOfficeTimeOfDay(office.root, "night")
    applyOfficeTimeOfDay(office.root, "day")
    expect(office.daySky.visible).toBe(true)
    expect(office.nightSky.visible).toBe(false)
    expect(office.deskLight.visible).toBe(false)
    expect(office.lampGlow.emissiveIntensity).toBe(TIME_OF_DAY_LOOKS.day.lampGlowIntensity)
  })

  test("the looks are the viewer's: exposure 1.0 by day and 1.1 at night, lamps 0.15 and 1.6", () => {
    expect(TIME_OF_DAY_LOOKS.day.exposure).toBe(1)
    expect(TIME_OF_DAY_LOOKS.night.exposure).toBe(1.1)
    expect(TIME_OF_DAY_LOOKS.day.lampGlowIntensity).toBe(0.15)
    expect(TIME_OF_DAY_LOOKS.night.lampGlowIntensity).toBe(1.6)
    expect(TIME_OF_DAY_LOOKS.day.background).toBe("#dde2e9")
    expect(TIME_OF_DAY_LOOKS.night.background).toBe("#0a0e1a")
  })
})
