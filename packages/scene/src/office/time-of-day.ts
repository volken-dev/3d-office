import type * as THREE from "three/webgpu"
import { isLight, isMesh, isStandardMaterial, materialsOf } from "../scene-graph-guards"
import type { TimeOfDay } from "../scene-intent"

/** How the scene is lit at a time of day: the agent-office viewer's day and night settings. */
export interface TimeOfDayLook {
  background: string
  exposure: number
  hemisphereSky: string
  hemisphereGround: string
  hemisphereIntensity: number
  sunColor: string
  sunIntensity: number
  shadowCatcherOpacity: number
  lampGlowIntensity: number
}

/** The viewer's two looks, keyed by time of day. */
export const TIME_OF_DAY_LOOKS: Readonly<Record<TimeOfDay, TimeOfDayLook>> = {
  day: {
    background: "#dde2e9",
    exposure: 1,
    hemisphereSky: "#ffffff",
    hemisphereGround: "#8791a3",
    hemisphereIntensity: 1.5,
    sunColor: "#ffffff",
    sunIntensity: 2.4,
    shadowCatcherOpacity: 0.22,
    lampGlowIntensity: 0.15,
  },
  night: {
    background: "#0a0e1a",
    exposure: 1.1,
    hemisphereSky: "#5a6aa8",
    hemisphereGround: "#141826",
    hemisphereIntensity: 0.45,
    sunColor: "#8fa6ff",
    sunIntensity: 0.3,
    shadowCatcherOpacity: 0.1,
    lampGlowIntensity: 1.6,
  },
}

const DAY_ONLY_PREFIX = "day-only"
const NIGHT_ONLY_PREFIX = "night-only"
const NIGHT_LIGHT_PREFIX = "night-light-"
const LAMP_GLOW_MATERIAL = "lamp_glow"

/**
 * Switches the office's own day and night parts: `day-only-*` nodes (the day sky) show by day,
 * `night-only-*` nodes and the `night-light-*` point lights at night, and the `lamp_glow`
 * material's emissive intensity rises at night.
 */
export function applyOfficeTimeOfDay(root: THREE.Object3D, timeOfDay: TimeOfDay): void {
  const isNight = timeOfDay === "night"
  const lampGlowIntensity = TIME_OF_DAY_LOOKS[timeOfDay].lampGlowIntensity
  root.traverse((node) => {
    if (node.name.startsWith(DAY_ONLY_PREFIX)) node.visible = !isNight
    if (node.name.startsWith(NIGHT_ONLY_PREFIX)) node.visible = isNight
    if (isLight(node) && node.name.startsWith(NIGHT_LIGHT_PREFIX)) node.visible = isNight
    if (!isMesh(node)) return
    for (const material of materialsOf(node)) {
      if (material.name === LAMP_GLOW_MATERIAL && isStandardMaterial(material)) {
        material.emissiveIntensity = lampGlowIntensity
      }
    }
  })
}
