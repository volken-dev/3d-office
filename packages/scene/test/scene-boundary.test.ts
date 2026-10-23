import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const SCENE_DIR = path.resolve(import.meta.dir, "../../src/simulation")
const ALLOWED_PACKAGES = [/^three(\/|$)/, /^@recast-navigation\//, /^zod$/]
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*"([^"]+)"/g

function sceneFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sceneFiles(entryPath)
    return entry.name.endsWith(".ts") ? [entryPath] : []
  })
}

/** Why an import breaks the boundary, or null when it stays inside the scene or uses an allowed package. */
function violation(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(file), specifier)
    return resolved.startsWith(SCENE_DIR + path.sep) ? null : "reaches outside the scene"
  }
  return ALLOWED_PACKAGES.some((pattern) => pattern.test(specifier))
    ? null
    : "is not an allowed package"
}

describe("scene boundary", () => {
  test("the scene imports only itself, three, recast-navigation and zod", () => {
    const files = sceneFiles(SCENE_DIR)
    expect(files.length).toBeGreaterThan(20)
    const violations = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(IMPORT_SPECIFIER)].flatMap(([, specifier]) => {
        const reason = specifier ? violation(file, specifier) : null
        return reason ? [`${path.relative(SCENE_DIR, file)}: "${specifier}" ${reason}`] : []
      }),
    )
    expect(violations).toEqual([])
  })

  test("the check catches an import from the app and from another workspace package", () => {
    const file = path.join(SCENE_DIR, "scene-manager.ts")
    expect(violation(file, "../integration/screen-positions")).toBe("reaches outside the scene")
    expect(violation(file, "@the-delegation/agents/team")).toBe("is not an allowed package")
    expect(violation(file, "react")).toBe("is not an allowed package")
    expect(violation(file, "./core/engine")).toBeNull()
    expect(violation(file, "three/webgpu")).toBeNull()
  })
})
