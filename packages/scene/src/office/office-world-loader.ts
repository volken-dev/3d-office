import {
  type AssetContract,
  AssetContractSchema,
  contractMajorVersion,
  SUPPORTED_CONTRACT_MAJOR,
} from "@the-delegation/office-sim/asset-contract"
import {
  type OfficeExtras,
  OfficeExtrasSchema,
  type OfficePoi,
} from "@the-delegation/office-sim/office-extras"
import { createOfficeWorld, type OfficeWorld } from "@the-delegation/office-sim/office-world"
import * as THREE from "three/webgpu"
import contractJson from "../../assets/asset-contract.json"

const POI_PREFIX = "poi-"

/**
 * The office's points of interest, read from its empty nodes named `poi-<kind>-<id>`: the world
 * position on the floor and the yaw the node's rotation (a pure yaw, 0 facing +Z) gives.
 */
export function readOfficePois(root: THREE.Object3D): OfficePoi[] {
  root.updateMatrixWorld(true)
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const pois: OfficePoi[] = []
  root.traverse((node) => {
    if (!node.name.startsWith(POI_PREFIX)) return
    node.getWorldPosition(position)
    node.getWorldQuaternion(rotation)
    pois.push({ name: node.name, x: position.x, z: position.z, yaw: yawOf(rotation) })
  })
  return pois
}

/** The rotation about +Y of a pure-yaw quaternion, wrapped to (-PI, PI]. */
function yawOf(rotation: THREE.Quaternion): number {
  const yaw = 2 * Math.atan2(rotation.y, rotation.w)
  return Math.atan2(Math.sin(yaw), Math.cos(yaw))
}

/**
 * Parses the office's scene extras (its walk grid, approach points, agent states and status
 * colours). The file is untrusted input: a mismatch fails the load naming the field.
 */
export function readOfficeExtras(sceneExtras: unknown): OfficeExtras {
  const result = OfficeExtrasSchema.safeParse(sceneExtras)
  if (result.success) return result.data
  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")
  throw new Error(`office.glb scene extras are not what the scene expects: ${problems}`)
}

/**
 * The asset contract shipped beside the models, parsed. Refuses a contract whose major version
 * differs from the one the movement code is written against.
 */
export function readAssetContract(contract: unknown = contractJson): AssetContract {
  const parsed = AssetContractSchema.parse(contract)
  const major = contractMajorVersion(parsed.contractVersion)
  if (major !== SUPPORTED_CONTRACT_MAJOR) {
    throw new Error(
      `Asset contract ${parsed.contractVersion} is major ${major}; the scene supports major ${SUPPORTED_CONTRACT_MAJOR}`,
    )
  }
  return parsed
}

/** What the scene needs from a loaded office: its parsed extras and the world robots move in. */
export interface LoadedOfficeWorld {
  extras: OfficeExtras
  world: OfficeWorld
}

/** Builds the robots' shared world from a loaded office scene: extras, POI nodes and the contract. */
export function loadOfficeWorld(officeRoot: THREE.Object3D): LoadedOfficeWorld {
  const extras = readOfficeExtras(officeRoot.userData)
  const world = createOfficeWorld({
    extras,
    pois: readOfficePois(officeRoot),
    contract: readAssetContract(),
  })
  return { extras, world }
}
