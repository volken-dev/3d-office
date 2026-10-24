import { Document } from "@gltf-transform/core"
import { createAccessorFactory } from "../document/accessor-factory.ts"
import {
  DEFAULT_PALETTE,
  isEmissiveMaterial,
  materialMetallic,
  materialRoughness,
} from "../material-palette.ts"
import { srgbToLinear } from "../srgb-to-linear.ts"
import { addMinibotClips } from "./minibot-clips.ts"
import { buildMinibotParts, HOVER_HEIGHT } from "./minibot-design.ts"

/** A built minibot with a summary of what it holds. */
export interface BuiltMinibot {
  document: Document
  summary: { tris: number; materials: number; clips: string[] }
}

/**
 * Builds the minibot, a sub-agent: a small hovering bot that trails its parent agent, in the
 * robot's style and with the robot's material names and palette, so the product colours
 * `primary` with its parent's status colour. No skeleton: node `minibot` is the floor point under
 * it (the product moves and turns it) and its child `body` hovers beside the parent's head and is
 * animated by the clips.
 */
export function buildMinibot(): BuiltMinibot {
  const parts = buildMinibotParts()
  const document = new Document()
  const createAccessor = createAccessorFactory(document, document.createBuffer())
  const mesh = document.createMesh("minibot")
  let triangleCount = 0
  for (const [name, part] of parts) {
    const color = srgbToLinear(DEFAULT_PALETTE[name])
    const material = document
      .createMaterial(name)
      .setBaseColorFactor([...color, 1])
      .setMetallicFactor(materialMetallic(name))
      .setRoughnessFactor(materialRoughness(name))
    if (isEmissiveMaterial(name)) material.setEmissiveFactor(color)
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setMaterial(material)
        .setAttribute("POSITION", createAccessor("VEC3", new Float32Array(part.positions.flat())))
        .setAttribute("NORMAL", createAccessor("VEC3", new Float32Array(part.normals.flat())))
        .setIndices(createAccessor("SCALAR", new Uint16Array(part.indices))),
    )
    triangleCount += part.indices.length / 3
  }
  const body = document.createNode("body").setMesh(mesh).setTranslation([0, HOVER_HEIGHT, 0])
  const floorPoint = document.createNode("minibot").addChild(body)
  const scene = document.createScene("Scene").addChild(floorPoint)
  document.getRoot().setDefaultScene(scene)
  addMinibotClips(document, createAccessor, body)
  return {
    document,
    summary: {
      tris: triangleCount,
      materials: parts.size,
      clips: document
        .getRoot()
        .listAnimations()
        .map((animation) => animation.getName()),
    },
  }
}
