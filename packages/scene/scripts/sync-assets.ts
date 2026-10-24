/**
 * Copies the office, the robot and the asset contract from agent-office's `dist/` into this
 * package, byte for byte: agent-office already ships them meshopt-compressed and checked against
 * the contract. Usage: `bun run assets [path/to/agent-office/dist]` (or `AGENT_OFFICE_DIST`).
 * Refuses a contract whose major version differs from the one the code supports, since a major
 * bump renames or removes something the scene relies on.
 */
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  AssetContractSchema,
  contractMajorVersion,
  SUPPORTED_CONTRACT_MAJOR,
} from "@the-delegation/office-sim/asset-contract"

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..")
const DEFAULT_SOURCE = path.resolve(PACKAGE_ROOT, "..", "..", "..", "agent-office", "dist")

/** Each shipped file and where it lands in this package. */
const SYNCED_FILES = [
  { name: "office.glb", destination: path.join(PACKAGE_ROOT, "assets", "models", "office.glb") },
  { name: "robot.glb", destination: path.join(PACKAGE_ROOT, "assets", "models", "robot.glb") },
  {
    name: "asset-contract.json",
    destination: path.join(PACKAGE_ROOT, "assets", "asset-contract.json"),
  },
] as const

function fileHash(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function main(): void {
  const sourceDirectory = path.resolve(
    process.argv[2] ?? process.env.AGENT_OFFICE_DIST ?? DEFAULT_SOURCE,
  )
  for (const file of SYNCED_FILES) {
    if (!existsSync(path.join(sourceDirectory, file.name))) {
      throw new Error(`${file.name} is missing from ${sourceDirectory}. Run npm run build there.`)
    }
  }

  const contract = AssetContractSchema.parse(
    JSON.parse(readFileSync(path.join(sourceDirectory, "asset-contract.json"), "utf8")),
  )
  const major = contractMajorVersion(contract.contractVersion)
  if (major !== SUPPORTED_CONTRACT_MAJOR) {
    throw new Error(
      `Contract ${contract.contractVersion} is major ${major}; the scene supports major ${SUPPORTED_CONTRACT_MAJOR}. Update the code for the contract changelog first.`,
    )
  }

  for (const file of SYNCED_FILES) {
    const source = path.join(sourceDirectory, file.name)
    if (fileHash(source) === fileHash(file.destination)) {
      console.info(`unchanged  ${file.name}`)
      continue
    }
    copyFileSync(source, file.destination)
    console.info(`updated    ${file.name}`)
  }
  console.info(`contract ${contract.contractVersion} from ${sourceDirectory}`)
}

main()
