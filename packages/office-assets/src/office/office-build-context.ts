import type { OfficeGeometry } from "./office-geometry.ts"
import type { OfficeLayout } from "./office-layout-schema.ts"
import type { RandomSource } from "./seeded-random.ts"
import type { Vector2, Vector3 } from "./vector-math.ts"

/** A character marker `poi-<kind>-<n>`: an empty node; rotation 0 faces +z. */
export interface PointOfInterest {
  name: string
  position: Vector3
  rotation: number
}

/**
 * A world-space footprint robots walk round, on the floor plan: an axis-aligned rectangle, or an
 * oriented one (a polygon) when its frame is turned by other than a multiple of 90 degrees.
 */
export type Obstacle =
  | { kind: "rectangle"; minX: number; minZ: number; maxX: number; maxZ: number }
  | { kind: "polygon"; points: Vector2[] }

/** A row of identical items that slides exactly one spacing per loop of clip Ambient. */
export interface SlidingRow {
  node: string
  from: Vector3
  to: Vector3
}

/** A factory arm whose turret swings out and back once per loop of clip Ambient. */
export interface ArmSwing {
  node: string
  amplitude: number
  phase: number
}

/** A rack-top shuttle that slides back and forth along `direction` in clip Ambient. */
export interface ShuttleSlide {
  node: string
  from: Vector3
  direction: Vector3
  amplitude: number
  phase: number
}

/** Scene extras `agentBoard`: where the product draws the live agent board. */
export interface AgentBoardExtras {
  node: string
  material: string
  size: Vector2
  pixels: Vector2
  center: Vector3
}

/**
 * Everything the office build accumulates while the architecture and items are built, shared by
 * every builder. The order things are added is part of the output.
 */
export interface OfficeBuildContext {
  layout: OfficeLayout
  geometry: OfficeGeometry
  /** Size-based tessellation of small round parts; off (`LOD=0`) keeps the authored counts. */
  tessellateBySize: boolean
  /** The build's one seeded random sequence: builders draw from it in build order. */
  random: RandomSource
  obstacles: Obstacle[]
  pointsOfInterest: PointOfInterest[]
  /** `anim-*` node to its world pivot: the node's translation, its geometry stored relative to it. */
  animationPivots: Map<string, Vector3>
  slidingRows: SlidingRow[]
  armSwings: ArmSwing[]
  shuttleSlides: ShuttleSlide[]
  /** Running numbers for POIs without an id and for numbered `anim-*` nodes. */
  sequenceCounters: Map<string, number>
  /** Set by the wall_screen with `board: true`. */
  agentBoard: AgentBoardExtras | null
}

/** The next number of a named sequence, starting at 1. */
export function nextInSequence(context: OfficeBuildContext, sequence: string): number {
  const next = (context.sequenceCounters.get(sequence) || 0) + 1
  context.sequenceCounters.set(sequence, next)
  return next
}
