import { findOfficeMaterial, officeMaterial } from "./office-materials.ts"

/**
 * Materials the product addresses by name, which keep their own material: the status lights, the
 * lamps (emissive off by day), the plinth border, the navmesh and the agent board.
 */
function keptByName(material: string): boolean {
  return (
    /^status_/.test(material) ||
    ["lamp_glow", "border_glow", "navmesh", "agent_board"].includes(material)
  )
}

/**
 * The slot number of a per-agent status material `status_glow#<slot>`, or null for any other
 * material. All of them merge into one `status_glow` primitive whose UVs pick texel slot-1.
 */
export function statusSlot(material: string): number | null {
  const match = material.match(/^status_glow#(\d+)$/)
  return match ? Number(match[1]) : null
}

/**
 * True for a flat-colour material that collapses into the node's `palette` material: not kept by
 * name, untextured and opaque. Throws on an unknown material.
 */
export function isPaletteMaterial(material: string): boolean {
  if (statusSlot(material) !== null) return false
  const definition = officeMaterial(material)
  return (
    !keptByName(material) &&
    !definition.texture &&
    !definition.emissiveTexture &&
    definition.alpha === undefined
  )
}

/** True for a monitor face that merges into the node's `screens` material (the screen atlas). */
export function isScreenMaterial(material: string): boolean {
  return material.startsWith("screen_") && Boolean(findOfficeMaterial(material)?.emissiveTexture)
}

/**
 * The draw-call bucket a material merges into within its node: `status_glow`, `palette`,
 * `screens`, or its own name.
 */
export function drawCallBucket(material: string): string {
  if (statusSlot(material) !== null) return "status_glow"
  if (isPaletteMaterial(material)) return "palette"
  if (isScreenMaterial(material)) return "screens"
  return material
}
