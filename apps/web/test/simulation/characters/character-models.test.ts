import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  CHARACTER_MODELS,
  type CharacterModelDef,
  DEFAULT_CHARACTER_MODEL_ID,
  findCharacterModel,
  LEAD_CHARACTER_MODEL_ID,
  partRuleFor,
} from "../../../src/simulation/characters/characterModels"
import { AnimationName } from "../../../src/types"

const PUBLIC_DIR = path.resolve(import.meta.dir, "../../../public")

interface GltfJson {
  meshes?: { name?: string; primitives: { material?: number }[] }[]
  materials?: { name?: string }[]
  skins?: unknown[]
  animations?: { name?: string }[]
}

/** Reads the JSON chunk of a binary glTF: 12-byte header, then a chunk length, type and payload. */
function readGlbJson(url: string): GltfJson {
  const file = readFileSync(path.join(PUBLIC_DIR, url.replace(/^\/+/, "")))
  const jsonLength = file.readUInt32LE(12)
  return JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"))
}

function requireModel(id: string): CharacterModelDef {
  const model = findCharacterModel(id)
  if (!model) throw new Error(`${id} is not registered`)
  return model
}

describe("character model registry", () => {
  test("the default and lead models are registered, and ids are unique", () => {
    expect(findCharacterModel(DEFAULT_CHARACTER_MODEL_ID)).toBeDefined()
    expect(findCharacterModel(LEAD_CHARACTER_MODEL_ID)).toBeDefined()
    const ids = CHARACTER_MODELS.map((model) => model.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const model of CHARACTER_MODELS) {
    test(`${model.id}: the GLB is skinned and has every shared clip`, () => {
      const gltf = readGlbJson(model.url)
      expect(gltf.skins?.length ?? 0).toBeGreaterThan(0)
      const clips = new Set(gltf.animations?.map((animation) => animation.name))
      for (const name of Object.values(AnimationName)) expect(clips.has(name)).toBe(true)
    })
  }
})

describe("partRuleFor", () => {
  const human = requireModel("human")
  const robot = requireModel("robot")

  test("human: expression overlays, accessories, and a team-coloured body", () => {
    expect(partRuleFor(human, "eyes", "eyes")).toMatchObject({ expression: "eyes" })
    expect(partRuleFor(human, "mouth", "mouth")).toMatchObject({ expression: "mouth" })
    expect(partRuleFor(human, "headphones", "")).toMatchObject({ accessory: "headphones" })
    expect(partRuleFor(human, "cap", "")).toMatchObject({ accessory: "cap" })
    expect(partRuleFor(human, "body", "")).toEqual({ color: "instance" })
  })

  test("robot: primary panels take the team colour, other parts keep their own and glow", () => {
    expect(partRuleFor(robot, "body", "primary")).toEqual({
      material: "primary",
      color: "instance",
    })
    for (const material of ["secondary", "screen", "metal", "accent", "eye"]) {
      expect(partRuleFor(robot, "body_2", material)).toEqual({ color: "authored", emissive: true })
    }
  })

  test("every part of every registered GLB is matched by a rule of its model", () => {
    for (const model of CHARACTER_MODELS) {
      const gltf = readGlbJson(model.url)
      for (const mesh of gltf.meshes ?? []) {
        for (const primitive of mesh.primitives) {
          const materialName =
            primitive.material === undefined
              ? ""
              : (gltf.materials?.[primitive.material]?.name ?? "")
          const rule = partRuleFor(model, mesh.name ?? "", materialName)
          expect(model.parts).toContain(rule)
        }
      }
    }
  })
})
