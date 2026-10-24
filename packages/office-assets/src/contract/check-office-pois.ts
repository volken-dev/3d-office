import type { Node } from "@gltf-transform/core"
import type { FloorPoint } from "@the-delegation/office-sim/floor-point"
import type { OfficeExtras } from "@the-delegation/office-sim/office-extras"
import { decodeWalkGrid, type WalkGrid } from "@the-delegation/office-sim/walk-grid"
import type { ContractReport } from "./contract-report.ts"
import type { CheckedContract, SceneFile } from "./contract-schema.ts"
import { wildcardLookup } from "./wildcard-lookup.ts"

/** How far from floor level (y) a POI may sit, in metres. */
const FLOOR_LEVEL_RANGE = { min: -0.01, max: 0.05 }

/** How far an approach point may be from its POI, in metres. */
const MAX_APPROACH_DISTANCE = 1

/** Rotation quaternion components below this count as zero (a pure yaw has x = z = 0). */
const YAW_TOLERANCE = 1e-3

const POI_NAME = /^poi-(.+)-([^-]+)$/

function oneToMax(max: number): number[] {
  return Array.from({ length: max }, (_, index) => index + 1)
}

function poiKindOf(poiName: string): string {
  return POI_NAME.exec(poiName)?.[1] ?? ""
}

/** A POI pattern as a regular expression: `*` matches one dash-free name segment. */
function patternExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (character) =>
    character === "*" ? "[^-]+" : `\\${character}`,
  )
  return new RegExp(`^${escaped}$`)
}

/** Cells reachable from a start cell by 8-connected steps that never cut a blocked corner. */
function reachableFrom(
  grid: WalkGrid,
  start: readonly [number, number],
): (cell: readonly [number, number]) => boolean {
  const seen = new Uint8Array(grid.cols * grid.rows)
  const [startColumn, startRow] = start
  const queue: [number, number][] = [[startColumn, startRow]]
  seen[startRow * grid.cols + startColumn] = 1
  for (let next = queue.pop(); next; next = queue.pop()) {
    const [column, row] = next
    for (let columnStep = -1; columnStep <= 1; columnStep++) {
      for (let rowStep = -1; rowStep <= 1; rowStep++) {
        const nextColumn = column + columnStep
        const nextRow = row + rowStep
        if (columnStep === 0 && rowStep === 0) continue
        if (!grid.isWalkableCell(nextColumn, nextRow) || seen[nextRow * grid.cols + nextColumn]) {
          continue
        }
        const isDiagonal = columnStep !== 0 && rowStep !== 0
        const cutsCorner =
          !grid.isWalkableCell(column + columnStep, row) ||
          !grid.isWalkableCell(column, row + rowStep)
        if (isDiagonal && cutsCorner) continue
        seen[nextRow * grid.cols + nextColumn] = 1
        queue.push([nextColumn, nextRow])
      }
    }
  }
  return ([column, row]) => seen[row * grid.cols + column] === 1
}

/** POI kinds and ids are exactly the contract's; each POI is an empty node on the floor, yaw only. */
function collectPois(
  report: ContractReport,
  contract: CheckedContract,
  spec: SceneFile,
  nodes: readonly Node[],
): Map<string, FloorPoint> {
  const idsByKind = new Map<string, (number | string)[]>()
  const positions = new Map<string, FloorPoint>()
  for (const node of nodes.filter((candidate) => candidate.getName().startsWith("poi-"))) {
    const name = node.getName()
    const match = POI_NAME.exec(name)
    if (!match?.[1] || !match[2]) {
      report.fail(`can't parse POI name ${name}`)
      continue
    }
    const id = /^\d+$/.test(match[2]) ? Number(match[2]) : match[2]
    idsByKind.set(match[1], [...(idsByKind.get(match[1]) ?? []), id])
    const [x, y, z] = node.getTranslation()
    const rotation = node.getRotation()
    positions.set(name, [x, z])
    if (node.getMesh() || node.listChildren().length) report.fail(`${name} should be an empty node`)
    if (y < FLOOR_LEVEL_RANGE.min || y > FLOOR_LEVEL_RANGE.max) {
      report.fail(`${name} not at floor level (y=${y.toFixed(3)})`)
    }
    if (Math.abs(rotation[0]) >= YAW_TOLERANCE || Math.abs(rotation[2]) >= YAW_TOLERANCE) {
      report.fail(
        `${name} rotation is not a pure yaw [${rotation.map((value) => value.toFixed(3))}]`,
      )
    }
  }
  const kinds = new Set([
    ...Object.keys(spec.pois).filter((kind) => !kind.endsWith("*")),
    ...idsByKind.keys(),
  ])
  for (const kind of kinds) {
    const expected = wildcardLookup(spec.pois, kind)
    if (!expected) {
      report.fail(`POI kind ${kind} not in contract`)
      continue
    }
    if (!wildcardLookup(contract.poses.poiKinds, kind)) {
      report.fail(`POI kind ${kind} has no pose in poses.poiKinds`)
    }
    const found = idsByKind.get(kind) ?? []
    if (expected === "1..agents.max") {
      report.sameSet(`poi-${kind} ids`, oneToMax(contract.agents.max), found)
    } else if (expected === "generated") {
      report.sameSet(`poi-${kind} ids (contiguous from 1)`, oneToMax(found.length), found)
    } else report.sameSet(`poi-${kind} ids`, expected, found)
  }
  return positions
}

/** Every POI has an approach point, on walkable floor, reachable from the first spawn. */
function checkApproachPoints(
  report: ContractReport,
  extras: OfficeExtras,
  positions: ReadonlyMap<string, FloorPoint>,
): void {
  report.sameSet("approach points", positions.keys(), Object.keys(extras.approach))
  const grid = decodeWalkGrid(extras.nav)
  const spawnApproach = extras.approach["poi-idle-spawn-1"]
  const spawnCell = spawnApproach ? grid.cellOf(...spawnApproach) : null
  const isReachable =
    spawnCell && grid.isWalkableCell(...spawnCell) ? reachableFrom(grid, spawnCell) : null
  if (!isReachable) report.fail("poi-idle-spawn-1 approach is not on walkable floor")
  for (const [poiName, approach] of Object.entries(extras.approach)) {
    const cell = grid.cellOf(...approach)
    const position = positions.get(poiName)
    const distance = position ? Math.hypot(approach[0] - position[0], approach[1] - position[1]) : 0
    if (!grid.isWalkableCell(...cell)) {
      report.fail(
        `approach for ${poiName} (${approach.map((value) => value.toFixed(2))}) is not walkable`,
      )
    } else if (isReachable && !isReachable(cell)) {
      report.fail(`approach for ${poiName} is not reachable from poi-idle-spawn-1`)
    }
    if (distance > MAX_APPROACH_DISTANCE) {
      report.fail(`approach for ${poiName} is ${distance.toFixed(2)} m from it`)
    }
  }
}

/**
 * Agent states: each slot's POI patterns match real POIs, its clip exists in the robot with the
 * POI's pose, `own` is only used for kinds numbered per agent, and every state holds agents.max
 * agents at once.
 */
function checkAgentStates(
  report: ContractReport,
  contract: CheckedContract,
  spec: SceneFile,
  extras: OfficeExtras,
  poiNames: readonly string[],
  robotClipNames: readonly string[],
): void {
  report.sameSet(
    "agentStates",
    spec.agentStates,
    Object.keys(extras.agentStates).filter((name) => !name.startsWith("_")),
  )
  for (const [stateName, state] of Object.entries(extras.agentStates)) {
    if (stateName.startsWith("_")) continue
    const holdable = new Set<string>()
    for (const slot of state.slots) {
      if (!robotClipNames.includes(slot.clip)) {
        report.fail(`agentStates.${stateName}: clip ${slot.clip} not in robot.glb`)
      }
      for (const pattern of slot.pois) {
        const expression = patternExpression(pattern)
        const matches = poiNames.filter((poiName) => expression.test(poiName))
        if (!matches.length) {
          report.fail(`agentStates.${stateName}: ${pattern} matches no POI`)
          continue
        }
        const ownNeedsSlots = matches.some(
          (poiName) => wildcardLookup(spec.pois, poiKindOf(poiName)) !== "1..agents.max",
        )
        if (slot.assign === "own" && ownNeedsSlots) {
          report.fail(
            `agentStates.${stateName}: assign "own" needs a POI kind with ids 1..agents.max (${pattern})`,
          )
        }
        for (const poiName of matches) holdable.add(poiName)
        const clipPose = contract.poses.clips[slot.clip]
        const poiPoses = new Set(
          matches.map((poiName) => wildcardLookup(contract.poses.poiKinds, poiKindOf(poiName))),
        )
        for (const poiPose of poiPoses) {
          if (poiPose !== clipPose) {
            report.fail(
              `agentStates.${stateName}: ${slot.clip} (${clipPose}) at ${pattern} (${poiPose} POI)`,
            )
          }
        }
      }
    }
    if (holdable.size < contract.agents.max) {
      report.fail(
        `agentStates.${stateName} holds ${holdable.size} agents, needs agents.max ${contract.agents.max}`,
      )
    }
  }
}

/** Checks the office's POIs, approach points and agent states (see the functions above). */
export function checkOfficePois(
  report: ContractReport,
  contract: CheckedContract,
  spec: SceneFile,
  extras: OfficeExtras,
  nodes: readonly Node[],
  robotClipNames: readonly string[],
): void {
  const positions = collectPois(report, contract, spec, nodes)
  checkApproachPoints(report, extras, positions)
  checkAgentStates(report, contract, spec, extras, [...positions.keys()], robotClipNames)
}
