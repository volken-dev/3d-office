/**
 * Checks every shipped model against the asset contract and prints a line per file; exits 1 on
 * any break. Run by `bun run models` after compression, where all four files must exist.
 * Usage: `bun scripts/check-contract.ts`.
 */
import { checkContract } from "../src/contract/check-contract.ts"
import { readContract, readShippedModels } from "../src/contract/read-shipped-models.ts"
import { SHIPPED_MODEL_PATHS } from "../src/model-paths.ts"

const contract = readContract()
const report = checkContract(contract, await readShippedModels(), Object.keys(SHIPPED_MODEL_PATHS))
for (const error of report.errors) console.error(`  ✗ ${error}`)
for (const summary of report.summaries) {
  console.info(
    `${summary.passed ? "✓" : "✗"} ${summary.name.padEnd(15)} ${(summary.bytes / 1024).toFixed(0).padStart(4)} KB  ${String(summary.triangles).padStart(6)} tris  ${String(summary.drawCalls).padStart(3)} draws`,
  )
}
if (report.errors.length) {
  console.error(
    `\n${report.errors.length} contract error(s) (contract ${contract.contractVersion})`,
  )
  process.exit(1)
}
console.info(`\ncontract ${contract.contractVersion}: all files match`)
