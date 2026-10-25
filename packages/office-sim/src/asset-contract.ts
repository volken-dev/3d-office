import { z } from "zod"

/** The contract major version this code is written against; a different major is a breaking change. */
export const SUPPORTED_CONTRACT_MAJOR = 5

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

const ClipSequenceSchema = z.looseObject({
  enter: z.array(z.string().min(1)).optional(),
  exit: z.array(z.string().min(1)).optional(),
})

/**
 * The parts of the asset contract (`asset-contract.json`) the movement code relies on: the contract
 * version, how a robot gets into and out of each POI, and which POI kinds are seats. Other keys
 * are allowed through untouched, because the contract grows additively between minor versions.
 */
export const AssetContractSchema = z.looseObject({
  contractVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  transitions: z.looseObject({
    oneShotClips: z.array(z.string().min(1)),
    byPoiPose: z.record(z.string(), ClipSequenceSchema),
    byPoiKind: z.record(z.string(), ClipSequenceSchema),
  }),
  poses: z.looseObject({
    clips: z.record(z.string(), z.string()),
    poiKinds: z.record(z.string(), z.string()),
  }),
  statusColors: z.looseObject({
    colors: z.record(z.string(), z.string().regex(HEX_COLOUR)),
  }),
})

/** A parsed asset contract (see `AssetContractSchema`). */
export type AssetContract = z.infer<typeof AssetContractSchema>

/**
 * The major part of a `MAJOR.MINOR.PATCH` contract version, so callers can refuse a contract whose
 * major differs from `SUPPORTED_CONTRACT_MAJOR`. Throws on a malformed version.
 */
export function contractMajorVersion(version: string): number {
  const match = /^(\d+)\.\d+\.\d+$/.exec(version)
  if (!match?.[1]) {
    throw new Error(`contractMajorVersion: "${version}" is not a MAJOR.MINOR.PATCH version`)
  }
  return Number(match[1])
}
