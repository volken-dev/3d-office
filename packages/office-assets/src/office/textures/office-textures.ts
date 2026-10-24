import { mkdirSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { createSeededRandom } from "../seeded-random.ts"
import { agentBoardSvg } from "./agent-board-texture.ts"
import { ciPipelineSvg } from "./ci-pipeline-texture.ts"
import { codeScreenSvg } from "./code-screen-texture.ts"
import { dashboardSvg } from "./dashboard-texture.ts"
import { labFloorSvg } from "./lab-floor-texture.ts"
import { skylineSvg } from "./skyline-texture.ts"

/** A procedural texture: its file name without `.png`, and its SVG source. */
export interface OfficeTextureSource {
  name: string
  svg: string
}

/**
 * Every office texture as SVG, in the order that draws from the one seeded random sequence: the
 * order is part of the output, so a new texture goes at the end.
 */
export function officeTextureSources(): OfficeTextureSource[] {
  const random = createSeededRandom(7)
  return [
    { name: "code_a", svg: codeScreenSvg(random, "a") },
    { name: "code_b", svg: codeScreenSvg(random, "b") },
    { name: "term", svg: codeScreenSvg(random, "term") },
    { name: "status", svg: dashboardSvg(random, "status") },
    { name: "chart", svg: dashboardSvg(random, "chart") },
    { name: "sky_night", svg: skylineSvg(random, true) },
    { name: "sky_day", svg: skylineSvg(random, false) },
    { name: "ci", svg: ciPipelineSvg(random) },
    { name: "agent_board", svg: agentBoardSvg() },
    { name: "lab", svg: labFloorSvg(false) },
    { name: "lab_perf", svg: labFloorSvg(true) },
  ]
}

/** Rasterises every office texture to `<directory>/<name>.png`; returns the names written. */
export async function writeOfficeTextures(directory: string): Promise<string[]> {
  mkdirSync(directory, { recursive: true })
  const sources = officeTextureSources()
  await Promise.all(
    sources.map((source) =>
      sharp(Buffer.from(source.svg))
        .png()
        .toFile(path.join(directory, `${source.name}.png`)),
    ),
  )
  return sources.map((source) => source.name)
}
