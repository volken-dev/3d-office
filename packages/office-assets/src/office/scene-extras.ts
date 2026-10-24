import type { NavExtras } from "./nav-mesh.ts"
import type { AgentBoardExtras } from "./office-build-context.ts"
import type { OfficeLayout } from "./office-layout-schema.ts"
import { STATUS_OFF_COLOR } from "./office-materials.ts"
import type { Vector2 } from "./vector-math.ts"

/** What the product may rely on in the office scene, by node, material and extras name. */
const CONVENTIONS = {
  "static-*":
    "merged static geometry per zone; static-glass is transparent, static-screens are emissive monitor faces",
  palette:
    'flat-colour furniture/walls share material "palette" (colour, roughness/metal and emissive come from a nearest-filtered texture cell per original material)',
  screens:
    'monitor faces share material "screens"; screenAtlas gives each original screen texture as [u0,v0,u1,v1] in that atlas',
  "day-only-* / night-only-*": "show one set depending on time of day",
  "night-light-*":
    "KHR_lights_punctual point lights; enable at night only. Material lamp_glow should have emissive off by day.",
  "poi-<kind>-<n>": "character markers; rotation 0 faces +z",
  navMesh: "walkable area (hidden in game); the same grid is in extras.nav",
  "poi-stand-<zone>-<n>":
    "generated overflow standing spots, used by agent-state slots after the fixed POIs are full",
  "anim-*":
    "animated by clip Ambient (loop it): coffee steam, conveyor cargo, factory arms, rack shuttles, data link",
  status:
    "material status_glow samples texture status_colors: texel N-1 = desk N and charging bay N; write the agent's status colour (see statusColors)",
  "agent-board":
    "the agent board on the lobby wall: material agent_board, draw live agent rows into its emissive map (see agentBoard)",
  nav: "walk grid: cell (c, r) covers x = origin[0] + c*cell, z = origin[1] + r*cell; bit k = r*cols + c is bit (k & 7) of byte (k >> 3) of base64 bits, 1 = walkable for an agent centre (obstacles inflated by inflate)",
  approach:
    "per POI, the walkable [x, z] where an agent stops before sitting / plugging in (the POI itself when it is walkable); all reachable from poi-idle-spawn-1",
}

/** The inputs to the office scene's extras. */
export interface SceneExtrasInput {
  layout: OfficeLayout
  statusTextureWidth: number
  nav: NavExtras
  approachPoints: Map<string, Vector2>
  screenAtlasRects: Record<string, number[]>
  agentBoard: AgentBoardExtras | null
  paletteNames: string[]
  paletteUvs: Map<string, Vector2>
}

/**
 * The scene extras: conventions, agent slots, status lights, the walk grid, approach points, the
 * agent states (verbatim from the layout), the screen atlas, the agent board and the palette map.
 * Key order is part of the GLB.
 */
export function officeSceneExtras(input: SceneExtrasInput): Record<string, unknown> {
  const { layout } = input
  return {
    conventions: CONVENTIONS,
    agents: { max: layout.agents.max },
    statusColors: {
      texture: "status_colors",
      width: input.statusTextureWidth,
      desks: layout.agents.max,
      materials: ["status_glow"],
      colors: layout.statusColors,
      off: `#${STATUS_OFF_COLOR.toString(16).padStart(6, "0")}`,
    },
    nav: input.nav,
    approach: Object.fromEntries(input.approachPoints),
    agentStates: layout.agentStates,
    screenAtlas: input.screenAtlasRects,
    agentBoard: input.agentBoard,
    palette: Object.fromEntries(
      input.paletteNames.map((name) => [name, input.paletteUvs.get(name)]),
    ),
  }
}
