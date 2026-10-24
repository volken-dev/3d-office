import { describe, expect, test } from "bun:test"
import { AssetContractSchema } from "../src/asset-contract"
import { createOfficeWorld } from "../src/office-world"
import { TINY_CONTRACT, TINY_POIS, tinyExtras, tinyWorld } from "./support/tiny-office"

describe("createOfficeWorld", () => {
  test("looks transitions up by POI kind, then by the kind's pose", () => {
    const world = tinyWorld()
    expect(world.transitionFor("poi-charge-1")).toEqual({
      enter: ["Sit", "Plug_In"],
      exit: ["Plug_Out", "Stand"],
    })
    expect(world.transitionFor("poi-sit_work-2")).toEqual({ enter: ["Sit"], exit: ["Stand"] })
    expect(world.transitionFor("poi-ship-1")).toEqual({})
    expect(world.transitionFor("poi-stand-entry-1")).toEqual({})
  })

  test("treats a seat-named kind the contract does not list as a seat", () => {
    const world = tinyWorld()
    expect(world.transitionFor("poi-sit_lab-1")).toEqual({ enter: ["Sit"], exit: ["Stand"] })
    expect(world.transitionFor("poi-unknown-1")).toEqual({})
  })

  test("a listed kind's pose wins over its name", () => {
    const contract = AssetContractSchema.parse({
      ...TINY_CONTRACT,
      poses: { ...TINY_CONTRACT.poses, poiKinds: { sit_work: "stand" } },
    })
    const world = createOfficeWorld({ extras: tinyExtras(), pois: TINY_POIS, contract })
    expect(world.transitionFor("poi-sit_work-1")).toEqual({})
  })

  test("approaches a POI from its approach point, or the POI itself", () => {
    const world = tinyWorld()
    expect(world.approachOf("poi-sit_work-1")).toEqual([1.5, 2.5])
    expect(world.approachOf("poi-ship-1")).toEqual([8.5, 6.5])
    expect(() => world.approachOf("poi-missing-1")).toThrow()
  })

  test("indexes POIs by name and refuses duplicates", () => {
    const world = tinyWorld()
    expect(world.poiNames).toEqual(TINY_POIS.map((poi) => poi.name))
    expect(world.poiNamed("poi-charge-2").yaw).toBe(Math.PI)
    expect(world.taken.size).toBe(0)
    expect(() =>
      createOfficeWorld({
        extras: tinyExtras(),
        pois: [...TINY_POIS, { name: "poi-ship-1", x: 0, z: 0, yaw: 0 }],
        contract: TINY_CONTRACT,
      }),
    ).toThrow()
  })
})
