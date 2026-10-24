import { describe, expect, test } from "bun:test"
import * as THREE from "three/webgpu"
import {
  readAssetContract,
  readOfficeExtras,
  readOfficePois,
} from "../../src/office/office-world-loader"

function poiNode(name: string, x: number, z: number, yaw: number): THREE.Object3D {
  const node = new THREE.Object3D()
  node.name = name
  node.position.set(x, 0, z)
  node.rotation.set(0, yaw, 0)
  return node
}

describe("readOfficePois", () => {
  test("reads every poi-* node's floor position and yaw, and nothing else", () => {
    const root = new THREE.Group()
    root.add(poiNode("poi-sit_work-1", 1.5, -2, 0))
    root.add(poiNode("poi-idle-spawn-1", 9.3, 0, -Math.PI / 2))
    root.add(poiNode("not-a-poi", 4, 4, 1))
    const pois = readOfficePois(root)
    expect(pois.map((poi) => poi.name)).toEqual(["poi-sit_work-1", "poi-idle-spawn-1"])
    const [desk, spawn] = pois
    expect(desk?.x).toBeCloseTo(1.5)
    expect(desk?.z).toBeCloseTo(-2)
    expect(desk?.yaw).toBeCloseTo(0)
    expect(spawn?.x).toBeCloseTo(9.3)
    expect(spawn?.yaw).toBeCloseTo(-Math.PI / 2)
  })

  test("uses world transforms, and wraps a half turn to +PI", () => {
    const root = new THREE.Group()
    const parent = new THREE.Group()
    parent.position.set(2, 0, 3)
    parent.rotation.set(0, Math.PI / 2, 0)
    parent.add(poiNode("poi-charge-1", 1, 0, Math.PI / 2))
    root.add(parent)
    const [bay] = readOfficePois(root)
    expect(bay?.x).toBeCloseTo(2)
    expect(bay?.z).toBeCloseTo(2)
    expect(Math.abs(bay?.yaw ?? 0)).toBeCloseTo(Math.PI)
  })
})

describe("readOfficeExtras", () => {
  test("a malformed file fails naming the field", () => {
    expect(() => readOfficeExtras({ agents: { max: 5 } })).toThrow(/nav/)
    expect(() => readOfficeExtras(null)).toThrow(/scene extras/)
  })
})

describe("readAssetContract", () => {
  test("parses the shipped contract", () => {
    expect(readAssetContract().contractVersion).toMatch(/^5\./)
  })

  test("refuses a contract of another major version", () => {
    const shipped = readAssetContract()
    expect(() => readAssetContract({ ...shipped, contractVersion: "4.6.0" })).toThrow(/major 4/)
  })
})
