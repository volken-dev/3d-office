import { assetUrl } from "../../lib/asset"

/** Where a part's colour comes from: the character's team colour, or the model's own material or texture. */
export type ColorSource = "instance" | "authored"

/** Expression atlas channel a part samples: eyes use the xy offset, the mouth zw. */
export type ExpressionChannel = "eyes" | "mouth"

/** Optional per-character extras a model can include as parts. */
export type AccessoryId = "headphones" | "cap"

/**
 * How one part of a model is drawn. A part matches on its mesh name or its material name (case-insensitive
 * substring); a rule with neither matches every part, so it belongs last as the catch-all.
 */
export interface PartRule {
  mesh?: string
  material?: string
  color: ColorSource
  /** Glows with the material's authored emissive colour, if it has one. */
  emissive?: boolean
  /** Samples the expression atlas and is drawn as an overlay on the parts beneath it. */
  expression?: ExpressionChannel
  /** Shown only on characters wearing this accessory; rigidly skinned to the head bone when unskinned. */
  accessory?: AccessoryId
}

/**
 * - matte: every part uses one flat, rough surface (the stylised human look).
 * - authored: each part keeps its material's roughness, metalness and sidedness.
 */
export type SurfaceStyle = "matte" | "authored"

/**
 * A character model the scene can draw. To add a character, export its GLB to assets-src/models, run
 * `bun run assets` and add an entry here: every model must be skinned to a skeleton with the shared clip names
 * (AnimationName); missing clips fall back to idle. Models are loaded only when a team uses them.
 */
export interface CharacterModelDef {
  id: string
  label: string
  url: string
  surface: SurfaceStyle
  parts: readonly PartRule[]
}

export const CHARACTER_MODELS: readonly CharacterModelDef[] = [
  {
    id: "human",
    label: "Human",
    url: assetUrl("models/character.glb"),
    surface: "matte",
    parts: [
      { mesh: "eyes", color: "authored", expression: "eyes" },
      { mesh: "mouth", color: "authored", expression: "mouth" },
      { mesh: "headphones", color: "instance", accessory: "headphones" },
      { mesh: "cap", color: "instance", accessory: "cap" },
      { color: "instance" },
    ],
  },
  {
    id: "robot",
    label: "Robot",
    url: assetUrl("models/robot.glb"),
    surface: "authored",
    parts: [
      { material: "primary", color: "instance" },
      { color: "authored", emissive: true },
    ],
  },
]

/** Drawn for the user, and for agents with no character of their own. */
export const DEFAULT_CHARACTER_MODEL_ID = "human"
/** Drawn for a team's lead agent unless the lead names another character. */
export const LEAD_CHARACTER_MODEL_ID = "robot"

const MODELS_BY_ID: ReadonlyMap<string, CharacterModelDef> = new Map(
  CHARACTER_MODELS.map((model) => [model.id, model]),
)

/** The registered model with this id, or undefined. */
export function findCharacterModel(modelId: string): CharacterModelDef | undefined {
  return MODELS_BY_ID.get(modelId)
}

function matches(pattern: string | undefined, name: string): boolean {
  return pattern === undefined || name.toLowerCase().includes(pattern.toLowerCase())
}

const AUTHORED_PART: PartRule = { color: "authored" }

/** The first rule matching this part; a part no rule matches keeps its authored look. */
export function partRuleFor(
  model: CharacterModelDef,
  meshName: string,
  materialName: string,
): PartRule {
  return (
    model.parts.find(
      (rule) => matches(rule.mesh, meshName) && matches(rule.material, materialName),
    ) ?? AUTHORED_PART
  )
}
