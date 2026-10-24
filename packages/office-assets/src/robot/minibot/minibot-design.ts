import type { MaterialName } from "../material-palette.ts"
import { type ShellPart, superEllipsoidShell } from "./minibot-shell.ts"

/** Body centre above the floor: above a seated or standing robot's shoulder, clear of desks and pod wings. */
export const HOVER_HEIGHT = 1.3

/**
 * The minibot's parts merged per material, in first-emitted order. Body frame: centre at the
 * origin, facing +Z. The shell is `primary`, which the product colours with the parent agent's
 * status colour; then the chin band, face glass, eyes, ear pods, antenna, and the thruster with
 * its glow (steady: no flicker).
 */
export function buildMinibotParts(): Map<MaterialName, ShellPart> {
  const parts = new Map<MaterialName, ShellPart>()
  const emit = (material: MaterialName, part: ShellPart) => {
    let merged = parts.get(material)
    if (!merged) {
      merged = { positions: [], normals: [], indices: [] }
      parts.set(material, merged)
    }
    const base = merged.positions.length
    merged.positions.push(...part.positions)
    merged.normals.push(...part.normals)
    merged.indices.push(...part.indices.map((index) => index + base))
  }
  emit("primary", superEllipsoidShell([0, 0, 0], [0.115, 0.1, 0.105], 0.3, 0.3, 12, 24))
  emit("secondary", superEllipsoidShell([0, -0.072, 0], [0.119, 0.012, 0.109], 0.3, 0.3, 4, 24))
  emit("screen", superEllipsoidShell([0, 0.01, 0.09], [0.088, 0.062, 0.022], 0.2, 0.2, 8, 20))
  for (const side of [-1, 1]) {
    emit(
      "eye",
      superEllipsoidShell([side * 0.032, 0.014, 0.113], [0.016, 0.022, 0.004], 0.4, 0.4, 4, 12),
    )
    emit(
      "secondary",
      superEllipsoidShell([side * 0.118, 0, -0.005], [0.014, 0.045, 0.045], 0.5, 1, 6, 16),
    )
    emit(
      "accent",
      superEllipsoidShell([side * 0.133, 0, -0.005], [0.004, 0.03, 0.03], 0.6, 1, 4, 12),
    )
  }
  emit("metal", superEllipsoidShell([0.03, 0.1, -0.02], [0.018, 0.01, 0.018], 0.5, 1, 4, 12))
  emit("secondary", superEllipsoidShell([0.03, 0.14, -0.02], [0.005, 0.04, 0.005], 0.2, 1, 4, 8))
  emit("accent", superEllipsoidShell([0.03, 0.19, -0.02], [0.018, 0.018, 0.018], 1, 1, 8, 12))
  emit("metal", superEllipsoidShell([0, -0.1, 0], [0.05, 0.022, 0.05], 0.4, 1, 6, 16))
  emit("accent", superEllipsoidShell([0, -0.123, 0], [0.034, 0.004, 0.034], 0.5, 1, 4, 16))
  return parts
}
