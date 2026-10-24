/**
 * The material names shared by the robot, robot-lite and the minibot. The product recolours parts
 * by these names, so they are part of the asset contract.
 */
export const MATERIAL_NAMES = ["primary", "secondary", "metal", "accent", "screen", "eye"] as const

/** One of {@link MATERIAL_NAMES}. */
export type MaterialName = (typeof MATERIAL_NAMES)[number]

/** A `0xRRGGBB` sRGB colour per material. */
export type Palette = Record<MaterialName, number>

/**
 * The default colours. `primary` is a neutral grey because the product recolours it by the
 * agent's status (the contract's `statusColors`).
 */
export const DEFAULT_PALETTE: Readonly<Palette> = {
  primary: 0xd3d8e0,
  secondary: 0x252c3a,
  metal: 0xaab4c3,
  accent: 0x3fe0ff,
  screen: 0x0b0f16,
  eye: 0xe8f6ff,
}

/** Metallic factor per material: metal and the dark trim catch some reflection. */
export function materialMetallic(name: MaterialName): number {
  if (name === "metal") return 0.35
  if (name === "secondary") return 0.15
  return 0.05
}

/** Roughness factor per material: the screen glass is glossy, the shell semi-gloss. */
export function materialRoughness(name: MaterialName): number {
  if (name === "primary") return 0.42
  if (name === "screen") return 0.12
  if (name === "metal") return 0.4
  return 0.55
}

/** Accent and eye parts glow in their own colour. */
export function isEmissiveMaterial(name: MaterialName): boolean {
  return name === "accent" || name === "eye"
}
