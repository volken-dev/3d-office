/**
 * Validates the raw and shipped models with the Khronos glTF validator; exits 1 on any error.
 * Usage: `bun run models:validate`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { RAW_MODELS_DIRECTORY, SHIPPED_MODEL_PATHS } from "../src/model-paths.ts"
import { seriousMessages, validateModel } from "../src/validate-model.ts"

/** How many errors and warnings to print per file before eliding the rest. */
const MESSAGES_SHOWN = 15

const rawModels = existsSync(RAW_MODELS_DIRECTORY)
  ? readdirSync(RAW_MODELS_DIRECTORY)
      .filter((name) => name.endsWith(".glb"))
      .map((name) => path.join(RAW_MODELS_DIRECTORY, name))
  : []
const shippedModels = Object.values(SHIPPED_MODEL_PATHS).filter((filePath) => existsSync(filePath))

let failed = false
for (const filePath of [...rawModels, ...shippedModels]) {
  const validation = await validateModel(new Uint8Array(readFileSync(filePath)))
  const { numErrors, numWarnings, numInfos } = validation.issues
  console.info(
    `${path.relative(process.cwd(), filePath)}: ${numErrors} errors, ${numWarnings} warnings, ${numInfos} infos`,
  )
  for (const message of seriousMessages(validation).slice(0, MESSAGES_SHOWN)) {
    console.info(
      `  ${message.severity} ${message.code} ${message.message} ${message.pointer ?? ""}`,
    )
  }
  if (numErrors) failed = true
}
if (failed) process.exit(1)
