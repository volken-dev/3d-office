/**
 * Copies the scene's models from `packages/scene/assets/models` into `public/models`, so `next dev`
 * serves them and `next build` exports them. Runs before every dev and build; the copy is
 * gitignored and replaced whole each time, so a removed model never lingers.
 */
import { cpSync, rmSync } from "node:fs"
import path from "node:path"

const WEB_ROOT = path.resolve(import.meta.dirname, "..")
const SCENE_MODELS = path.resolve(WEB_ROOT, "..", "..", "packages", "scene", "assets", "models")
const PUBLIC_MODELS = path.join(WEB_ROOT, "public", "models")

rmSync(PUBLIC_MODELS, { recursive: true, force: true })
cpSync(SCENE_MODELS, PUBLIC_MODELS, { recursive: true })
