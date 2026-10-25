import path from "node:path"
import { PACKAGE_ROOT, RAW_MODELS_DIRECTORY } from "../model-paths.ts"

/** The procedural textures: written by `build-office-textures`, read by the office build. */
export const OFFICE_TEXTURES_DIRECTORY = path.join(PACKAGE_ROOT, "out", "textures")

/** The office as data; the `LAYOUT` environment variable overrides it. */
export const DEFAULT_OFFICE_LAYOUT_PATH = path.join(import.meta.dirname, "office-layout.json")

/** The raw (uncompressed) office model; the build's first argument overrides it. */
export const DEFAULT_OFFICE_OUTPUT_PATH = path.join(RAW_MODELS_DIRECTORY, "office.glb")
