import type { Document, Material, Node, Skin } from "@gltf-transform/core"
import type { MeshAccumulator } from "../geometry/mesh-accumulator.ts"
import { smoothNormals } from "../geometry/vertex-normals.ts"
import type { MaterialName } from "../material-palette.ts"
import { FACE_TARGET_NAMES, type FaceTargetPositions } from "../parts/face.ts"
import type { AccessorFactory } from "./accessor-factory.ts"

/** Vertex and triangle counts of one mesh. */
export interface MeshStats {
  verts: number
  tris: number
}

/** The skinned mesh nodes written, with their counts. */
export interface RobotMeshes {
  nodes: Map<string, Node>
  stats: Record<string, MeshStats>
}

/** Face normals all point straight out of the face plane (+Z). */
function faceNormals(vertexComponentCount: number): Float32Array {
  return new Float32Array(vertexComponentCount).map((_, component) => (component % 3 === 2 ? 1 : 0))
}

/**
 * Writes each accumulated group as a skinned mesh node under the armature, one primitive per
 * material. The face primitive also gets its morph targets, stored as offsets from the base shape,
 * and starts with every weight at 0.
 */
export function writeRobotMeshes(
  document: Document,
  accumulator: MeshAccumulator,
  faceTargets: readonly FaceTargetPositions[],
  materialFor: (name: MaterialName) => Material,
  createAccessor: AccessorFactory,
  armature: Node,
  skin: Skin,
): RobotMeshes {
  const nodes = new Map<string, Node>()
  const stats: Record<string, MeshStats> = {}
  for (const [group, byMaterial] of accumulator.groups) {
    const mesh = document.createMesh(group)
    let vertexCount = 0
    let triangleCount = 0
    for (const [materialName, buffers] of byMaterial) {
      const normals =
        group === "face" ? faceNormals(buffers.positions.length) : smoothNormals(buffers)
      const primitive = document
        .createPrimitive()
        .setMaterial(materialFor(materialName))
        .setAttribute("POSITION", createAccessor("VEC3", new Float32Array(buffers.positions)))
        .setAttribute("NORMAL", createAccessor("VEC3", normals))
        .setAttribute("TEXCOORD_0", createAccessor("VEC2", new Float32Array(buffers.uvs)))
        .setAttribute("JOINTS_0", createAccessor("VEC4", new Uint8Array(buffers.joints)))
        .setAttribute("WEIGHTS_0", createAccessor("VEC4", new Float32Array(buffers.weights)))
        .setIndices(
          createAccessor(
            "SCALAR",
            buffers.positions.length / 3 < 65535
              ? new Uint16Array(buffers.indices)
              : new Uint32Array(buffers.indices),
          ),
        )
      if (group === "face") {
        for (const targetName of FACE_TARGET_NAMES) {
          const offsets = new Float32Array(buffers.positions.length)
          faceTargets.forEach((targets, vertex) => {
            const position = targets[targetName]
            if (position) {
              for (let axis = 0; axis < 3; axis++) {
                offsets[vertex * 3 + axis] = position[axis] - buffers.positions[vertex * 3 + axis]
              }
            }
          })
          primitive.addTarget(
            document
              .createPrimitiveTarget(targetName)
              .setAttribute("POSITION", createAccessor("VEC3", offsets)),
          )
        }
      }
      mesh.addPrimitive(primitive)
      vertexCount += buffers.positions.length / 3
      triangleCount += buffers.indices.length / 3
    }
    if (group === "face") {
      mesh
        .setWeights(new Array(FACE_TARGET_NAMES.length).fill(0))
        .setExtras({ targetNames: [...FACE_TARGET_NAMES] })
    }
    const node = document.createNode(group).setMesh(mesh).setSkin(skin)
    armature.addChild(node)
    nodes.set(group, node)
    stats[group] = { verts: vertexCount, tris: triangleCount }
  }
  return { nodes, stats }
}
