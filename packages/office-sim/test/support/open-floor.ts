import { OfficeExtrasSchema, type OfficePoi } from "../../src/office-extras"
import { createOfficeWorld, type OfficeWorld } from "../../src/office-world"
import { TINY_CONTRACT } from "./tiny-office"
import { navFromMap } from "./walk-grid-map"

/** Grid cell of the open floor, as fine as the real office's walk grid. */
const CELL = 0.1

/** A standing spot at each end of the floor and one in the middle, all on its centre line. */
const OPEN_FLOOR_POIS = (length: number, width: number): OfficePoi[] => [
  { name: "poi-stand-west-1", x: 1, z: width / 2, yaw: 0 },
  { name: "poi-stand-east-1", x: length - 1, z: width / 2, yaw: 0 },
  { name: "poi-stand-middle-1", x: length / 2, z: width / 2, yaw: 0 },
]

function floorMap(length: number, width: number): string[] {
  const columns = Math.round(length / CELL)
  return Array.from({ length: Math.round(width / CELL) }, () => ".".repeat(columns))
}

/**
 * An empty walkable floor (`length` x `width` metres on a 0.1 m grid) with three standing spots on
 * its centre line, and states `west`, `east` and `middle` that send a robot to each, so steering
 * tests can walk robots straight at, after and past each other.
 */
export function openFloorWorld({ length = 12, width = 4 } = {}): OfficeWorld {
  const extras = OfficeExtrasSchema.parse({
    agents: { max: 3 },
    nav: navFromMap(floorMap(length, width), { cell: CELL }),
    approach: {},
    agentStates: {
      west: { color: "green", slots: [{ pois: ["poi-stand-west-*"], clip: "Idle" }] },
      east: { color: "green", slots: [{ pois: ["poi-stand-east-*"], clip: "Idle" }] },
      middle: { color: "green", slots: [{ pois: ["poi-stand-middle-*"], clip: "Idle" }] },
    },
    statusColors: {
      texture: "status_colors",
      width: 4,
      desks: 3,
      materials: ["status_glow"],
      colors: { green: "#2fbf71" },
      off: "#4a505c",
    },
  })
  return createOfficeWorld({
    extras,
    pois: OPEN_FLOOR_POIS(length, width),
    contract: TINY_CONTRACT,
  })
}
