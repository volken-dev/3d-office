import { existsSync, readFileSync, statSync } from "node:fs"
import { createModelIo } from "../gltf-io.ts"
import { CONTRACT_PATH, SHIPPED_MODEL_PATHS } from "../model-paths.ts"
import type { LoadedModel } from "./check-contract.ts"
import { type CheckedContract, CheckedContractSchema } from "./contract-schema.ts"

/** Reads and parses the asset contract beside the scene's models. */
export function readContract(): CheckedContract {
  return CheckedContractSchema.parse(JSON.parse(readFileSync(CONTRACT_PATH, "utf8")))
}

/**
 * Reads every shipped model that exists on disk. The office and robot are committed; robot-lite
 * and minibot exist only after a local `bun run models`, so they may be absent.
 */
export async function readShippedModels(): Promise<Map<string, LoadedModel>> {
  const io = await createModelIo()
  const models = new Map<string, LoadedModel>()
  for (const [name, filePath] of Object.entries(SHIPPED_MODEL_PATHS)) {
    if (!existsSync(filePath)) continue
    models.set(name, { document: await io.read(filePath), bytes: statSync(filePath).size })
  }
  return models
}
