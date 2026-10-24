import { AssetContractSchema } from "@the-delegation/office-sim/asset-contract"
import { z } from "zod"

const BudgetSchema = z.looseObject({
  maxTriangles: z.number().int().positive(),
  maxDrawCalls: z.number().int().positive(),
  maxBytes: z.number().int().positive(),
})

const SAME_AS_ROBOT = z.literal("same as robot.glb")

const MorphTargetsSchema = z.looseObject({
  mesh: z.string().min(1),
  names: z.array(z.string().min(1)),
})

const CharacterFileSchema = z.looseObject({
  kind: z.literal("character"),
  joints: z.array(z.string().min(1)),
  hiddenAtRest: z.array(z.string().min(1)),
  meshes: z.array(z.string().min(1)),
  morphTargets: MorphTargetsSchema,
  materials: z.array(z.string().min(1)),
  clips: z.array(z.string().min(1)),
  budget: BudgetSchema,
})

const CharacterLodFileSchema = z.looseObject({
  kind: z.literal("character-lod"),
  lodOf: z.string().min(1),
  joints: z.union([SAME_AS_ROBOT, z.array(z.string().min(1))]),
  hiddenAtRest: z.array(z.string().min(1)),
  meshes: z.array(z.string().min(1)),
  morphTargets: z.union([SAME_AS_ROBOT, MorphTargetsSchema]),
  materials: z.array(z.string().min(1)),
  clips: z.array(z.string().min(1)),
  animationsFrom: z.string().min(1),
  budget: BudgetSchema,
})

const CompanionFileSchema = z.looseObject({
  kind: z.literal("companion"),
  nodes: z.array(z.string().min(1)),
  materials: z.array(z.string().min(1)),
  clips: z.array(z.string().min(1)),
  budget: BudgetSchema,
})

/** POI ids per kind: a fixed list, one per agent slot, or generated (contiguous from 1). */
const PoiIdsSchema = z.union([
  z.literal("1..agents.max"),
  z.literal("generated"),
  z.array(z.union([z.number().int(), z.string().min(1)])),
])

const SceneFileSchema = z.looseObject({
  kind: z.literal("scene"),
  nodes: z.array(z.string().min(1)),
  nodePrefixes: z.record(z.string(), z.unknown()),
  zones: z.array(z.string().min(1)),
  clips: z.array(z.string().min(1)),
  pois: z.record(z.string(), PoiIdsSchema),
  nightLights: z.array(z.string().min(1)),
  materials: z.array(z.string().min(1)),
  sceneExtras: z.array(z.string().min(1)),
  agentStates: z.array(z.string().min(1)),
  budget: BudgetSchema,
})

/** One file's entry in the contract, by kind. */
export const ContractFileSchema = z.discriminatedUnion("kind", [
  CharacterFileSchema,
  CharacterLodFileSchema,
  CompanionFileSchema,
  SceneFileSchema,
])

/** A parsed contract file entry (see `ContractFileSchema`). */
export type ContractFile = z.infer<typeof ContractFileSchema>
/** The robot's contract entry. */
export type CharacterFile = z.infer<typeof CharacterFileSchema>
/** The office's contract entry. */
export type SceneFile = z.infer<typeof SceneFileSchema>

/**
 * The whole asset contract as the checker reads it: the movement code's view
 * (`AssetContractSchema`) plus the file specs, budgets, allowed extensions and agent capacity. The
 * robot must be listed, since the LOD and the office's agent states are checked against it.
 */
export const CheckedContractSchema = AssetContractSchema.extend({
  loading: z.looseObject({ allowedExtensions: z.array(z.string().min(1)) }),
  agents: z.looseObject({ max: z.number().int().positive() }),
  files: z
    .record(z.string(), ContractFileSchema)
    .refine((files) => files["robot.glb"]?.kind === "character", {
      message: 'files must list "robot.glb" as a character',
    }),
})

/** A parsed asset contract, as the checker reads it (see `CheckedContractSchema`). */
export type CheckedContract = z.infer<typeof CheckedContractSchema>
