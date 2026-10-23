import type { LoadedCharacterModel } from "../entities/character-manager"
import type { SceneLoader } from "../loaders"
import { findCharacterModel } from "./character-models"

/** Downloads and decodes the registered models with these ids, in parallel; unknown ids are skipped. */
export async function loadCharacterModels(
  loader: SceneLoader,
  modelIds: readonly string[],
): Promise<LoadedCharacterModel[]> {
  const models = modelIds.flatMap((modelId) => {
    const model = findCharacterModel(modelId)
    return model ? [model] : []
  })
  return Promise.all(models.map(async (model) => ({ model, gltf: await loader.load(model.url) })))
}
