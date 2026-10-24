import { type AssetContract, AssetContractSchema } from "../../src/asset-contract"
import { type OfficeExtras, OfficeExtrasSchema, type OfficePoi } from "../../src/office-extras"
import { createOfficeWorld, type OfficeWorld } from "../../src/office-world"
import { navFromMap } from "./walk-grid-map"

/** A minimal contract with the shipped transitions: seats Sit/Stand, chargers add Plug_In/Plug_Out. */
export const TINY_CONTRACT: AssetContract = AssetContractSchema.parse({
  contractVersion: "5.0.0",
  transitions: {
    oneShotClips: ["Sit", "Stand", "Plug_In", "Plug_Out"],
    byPoiPose: { sit: { enter: ["Sit"], exit: ["Stand"] } },
    byPoiKind: { charge: { enter: ["Sit", "Plug_In"], exit: ["Plug_Out", "Stand"] } },
  },
  poses: {
    clips: { Idle: "stand", Walk: "stand", Sit_Work: "sit", Charge: "sit" },
    poiKinds: {
      sit_work: "sit",
      charge: "sit",
      ship: "stand",
      "idle-spawn": "stand",
      "stand-*": "stand",
    },
  },
  statusColors: { colors: { green: "#2fbf71", yellow: "#f2c230" } },
})

/**
 * A 12 x 8 m room (1 m cells) with a wall down the middle that has a gap at the bottom:
 * desks on the left, chargers and benches on the right.
 */
const TINY_MAP = [
  "............",
  "............",
  "......#.....",
  "......#.....",
  "......#.....",
  "......#.....",
  "............",
  "............",
]

/** The tiny office's POIs: two pods, two bays, two benches, two spawns, two lobby spots. */
export const TINY_POIS: readonly OfficePoi[] = [
  { name: "poi-sit_work-1", x: 1.5, z: 1.5, yaw: 0 },
  { name: "poi-sit_work-2", x: 3.5, z: 1.5, yaw: 0 },
  { name: "poi-charge-1", x: 10.5, z: 1.5, yaw: Math.PI },
  { name: "poi-charge-2", x: 10.5, z: 3.5, yaw: Math.PI },
  { name: "poi-ship-1", x: 8.5, z: 6.5, yaw: 0 },
  { name: "poi-ship-2", x: 9.5, z: 6.5, yaw: 0 },
  { name: "poi-idle-spawn-1", x: 1.5, z: 6.5, yaw: 0 },
  { name: "poi-idle-spawn-2", x: 2.5, z: 6.5, yaw: 0 },
  { name: "poi-stand-entry-1", x: 4.5, z: 6.5, yaw: 0 },
  { name: "poi-stand-entry-2", x: 5.5, z: 7.5, yaw: 0 },
]

/** The tiny office's scene extras, parsed with the real schema. */
export function tinyExtras(): OfficeExtras {
  return OfficeExtrasSchema.parse({
    _note: "extra keys pass through",
    agents: { max: 2 },
    nav: navFromMap(TINY_MAP),
    approach: {
      "poi-sit_work-1": [1.5, 2.5],
      "poi-sit_work-2": [3.5, 2.5],
      "poi-charge-1": [9.5, 1.5],
      "poi-charge-2": [9.5, 3.5],
    },
    agentStates: {
      _format: "state -> { note, color, slots }",
      working: {
        color: "green",
        slots: [{ pois: ["poi-sit_work-*"], clip: "Sit_Work", assign: "own" }],
      },
      waiting_for_input: {
        color: "yellow",
        slots: [{ pois: ["poi-sit_work-*"], clip: "Sit_Wait", assign: "own" }],
      },
      paused_or_rate_limited: {
        color: "yellow",
        slots: [{ pois: ["poi-charge-*"], clip: "Charge", assign: "own" }],
      },
      shipping: {
        color: "green",
        slots: [{ pois: ["poi-ship-1"], clip: "Hammer" }],
      },
      arrive: {
        color: "yellow",
        slots: [
          { pois: ["poi-idle-spawn-*"], clip: "Wave" },
          { pois: ["poi-stand-entry-*"], clip: "Wave" },
        ],
      },
      queued: {
        color: "yellow",
        slots: [{ pois: ["poi-stand-entry-*"], clip: "LookAround", assign: "position" }],
      },
    },
    statusColors: {
      texture: "status_colors",
      width: 4,
      desks: 2,
      materials: ["status_glow"],
      colors: { green: "#2fbf71", yellow: "#f2c230" },
      off: "#4a505c",
    },
  })
}

/** A fresh world over the tiny office. */
export function tinyWorld(): OfficeWorld {
  return createOfficeWorld({ extras: tinyExtras(), pois: TINY_POIS, contract: TINY_CONTRACT })
}
