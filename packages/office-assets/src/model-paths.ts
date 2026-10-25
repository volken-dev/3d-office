import path from "node:path"

/** The office-assets package root, so every script resolves paths the same from any cwd. */
export const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..")

const SCENE_ASSETS = path.resolve(PACKAGE_ROOT, "..", "scene", "assets")

/** Generator output before compression: the raw GLBs (gitignored). */
export const RAW_MODELS_DIRECTORY = path.join(PACKAGE_ROOT, "out", "raw")

/**
 * The asset contract: what the scene and the movement code may rely on in the shipped models. It
 * lives beside the models the scene loads, and the generators are checked against it.
 */
export const CONTRACT_PATH = path.join(SCENE_ASSETS, "asset-contract.json")

/**
 * Where each compressed model ships. The scene loads the office and the robot, so they land in its
 * assets and are committed; robot-lite (a crowd LOD) and minibot (a sub-agent) are built and
 * checked but nothing loads them yet, so they stay in the gitignored `out/`.
 */
export const SHIPPED_MODEL_PATHS = {
  "robot.glb": path.join(SCENE_ASSETS, "models", "robot.glb"),
  "robot-lite.glb": path.join(PACKAGE_ROOT, "out", "robot-lite.glb"),
  "minibot.glb": path.join(PACKAGE_ROOT, "out", "minibot.glb"),
  "office.glb": path.join(SCENE_ASSETS, "models", "office.glb"),
} as const

/** A shipped model's file name. */
export type ShippedModelName = keyof typeof SHIPPED_MODEL_PATHS

/** The models the scene loads, committed so dev, CI and builds never need the source rig. */
export const COMMITTED_MODELS: readonly ShippedModelName[] = ["robot.glb", "office.glb"]
