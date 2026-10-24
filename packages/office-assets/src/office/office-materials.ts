/**
 * A source material: base colour (sRGB hex), roughness, metalness, a texture from the office
 * textures, an alpha (transparent, blended, double sided), `emissive` (glows in its own colour) or
 * `emissiveTexture` (a screen: black base, the texture as emission).
 */
export interface OfficeMaterial {
  color?: number
  roughness?: number
  metalness?: number
  texture?: string
  alpha?: number
  emissive?: boolean
  emissiveTexture?: boolean
}

/**
 * The office's materials by name. The decor is muted on purpose (pale lab floor, oak, steel, navy,
 * teal and plum fabrics, deep greens) so the only saturated colours are the robots and their
 * status lights: don't add saturated green, yellow, orange or red decor. The factory's floor paint,
 * steel and the unpainted robot shells on the belt are neutral, since a robot's colour is its
 * status.
 */
export const OFFICE_MATERIALS: Readonly<Record<string, OfficeMaterial>> = {
  wall: { color: 0xe8e2d8, roughness: 0.92 },
  wall_trim: { color: 0x3a404d, roughness: 0.7 },
  wall_cap: { color: 0x262b36, roughness: 0.6 },
  plinth: { color: 0x171b24, roughness: 0.8 },
  floor_lab: { color: 0xffffff, texture: "lab", roughness: 0.55, metalness: 0.05 },
  floor_lab_perf: { color: 0xffffff, texture: "lab_perf", roughness: 0.55, metalness: 0.1 },
  glass: { color: 0xcfe9ff, alpha: 0.16, roughness: 0.05 },
  frame: { color: 0x2a2f3a, roughness: 0.45, metalness: 0.3 },
  wood_furn: { color: 0xd2a679, roughness: 0.6 },
  wood_dark: { color: 0x6e4c3c, roughness: 0.55 },
  furn_light: { color: 0xf2f0ec, roughness: 0.6 },
  furn_dark: { color: 0x2b303b, roughness: 0.5 },
  metal: { color: 0xb9c1cc, metalness: 0.45, roughness: 0.35 },
  soil: { color: 0x4a3426 },
  fabric_chair: { color: 0x343d52, roughness: 0.85 },
  fabric_sofa: { color: 0x35606b, roughness: 0.9 },
  fabric_coral: { color: 0xb98783, roughness: 0.85 },
  mug_yellow: { color: 0xc4a46a, roughness: 0.6 },
  rug_mat: { color: 0x3a4458, roughness: 1 },
  book_1: { color: 0x9a5a52 },
  book_2: { color: 0x3f5f8f },
  book_3: { color: 0xc8b48a },
  book_4: { color: 0x4f6a60 },
  book_5: { color: 0x6b4f6e },
  pot: { color: 0xe2d6c6, roughness: 0.8 },
  plant_leaf: { color: 0x2f6a4a, roughness: 0.8 },
  plant_leaf2: { color: 0x4d8458, roughness: 0.8 },
  plant_snake: { color: 0x3f6b4c, roughness: 0.7 },
  plant_grass: { color: 0x7d9b6a, roughness: 0.85 },
  plant_fig: { color: 0x3b7a4f, roughness: 0.6 },
  plant_olive: { color: 0x8a9d84, roughness: 0.85 },
  pot_charcoal: { color: 0x3a3f4a, roughness: 0.8 },
  pot_white: { color: 0xeeeae4, roughness: 0.6 },
  pot_stone: { color: 0xb9b2a6, roughness: 0.9 },
  felt_navy: { color: 0x2f3f62, roughness: 1 },
  felt_plum: { color: 0x664a66, roughness: 1 },
  screen_dark: { color: 0x10141c, roughness: 0.25 },
  pcb: { color: 0x2f5a4c, roughness: 0.6 },
  bin_navy: { color: 0x3b4d75, roughness: 0.6 },
  bin_teal: { color: 0x3f7d80, roughness: 0.6 },
  bin_sand: { color: 0xc9b694, roughness: 0.7 },
  tape: { color: 0xb98783, roughness: 0.7 },
  floor_line: { color: 0xe9e6df, roughness: 0.7 },
  floor_paint: { color: 0x434a56, roughness: 0.8 },
  floor_paint_light: { color: 0xf1f2f3, roughness: 0.8 },
  steel: { color: 0x8e97a3, metalness: 0.6, roughness: 0.4 },
  steel_dark: { color: 0x4b525d, metalness: 0.5, roughness: 0.5 },
  bench_top: { color: 0x5c6470, metalness: 0.3, roughness: 0.55 },
  machine: { color: 0xe9ebee, roughness: 0.5 },
  shell: { color: 0xc3c8cf, roughness: 0.45 },
  pallet: { color: 0xb59d7a, roughness: 0.9 },
  led: { color: 0x3fe0ff, emissive: true },
  led_warm: { color: 0xffe4c2, emissive: true },
  lamp_glow: { color: 0xffe2b8, emissive: true },
  border_glow: { color: 0x3fe0ff, emissive: true },
  screen_code_a: { texture: "code_a", emissiveTexture: true },
  screen_code_b: { texture: "code_b", emissiveTexture: true },
  screen_term: { texture: "term", emissiveTexture: true },
  screen_status: { texture: "status", emissiveTexture: true },
  screen_chart: { texture: "chart", emissiveTexture: true },
  screen_ci: { texture: "ci", emissiveTexture: true },
  sky_day: { texture: "sky_day", emissiveTexture: true },
  sky_night: { texture: "sky_night", emissiveTexture: true },
  navmesh: { color: 0x32c98c, roughness: 1 },
  steam: { color: 0xf4f6f8, roughness: 1 },
  frosted: { color: 0xe9eef2, alpha: 0.62, roughness: 0.5 },
  agent_board: { texture: "agent_board", emissiveTexture: true },
}

/** The material of a name, or undefined when the office has none of that name. */
export function findOfficeMaterial(name: string): OfficeMaterial | undefined {
  return Object.hasOwn(OFFICE_MATERIALS, name) ? OFFICE_MATERIALS[name] : undefined
}

/** The material of a name; a name the office lacks throws (a typo in a builder or the layout). */
export function officeMaterial(name: string): OfficeMaterial {
  const material = findOfficeMaterial(name)
  if (material === undefined) throw new Error(`missing material ${name}`)
  return material
}

/**
 * The status lights' colour when no agent holds the slot: a dim neutral. Texel N-1 of texture
 * `status_colors` is pod N and docking bay N; the product writes the agent's status colour there
 * (the same colour as its robot).
 */
export const STATUS_OFF_COLOR = 0x4a505c

/** The status texture's width: a power of two holding every agent slot, at least 16. */
export function statusTextureWidth(maxAgents: number): number {
  return Math.max(16, 2 ** Math.ceil(Math.log2(maxAgents)))
}

/** The `[r, g, b]` bytes of a 0xRRGGBB colour. */
export function colorBytes(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255]
}
