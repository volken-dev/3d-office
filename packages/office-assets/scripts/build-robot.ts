/**
 * Builds the robot GLB: `node --experimental-strip-types scripts/build-robot.ts [out.glb]`.
 * `LITE=1` builds robot-lite (the crowd LOD), `Q` sets the mesh density, `PAL_JSON` overrides
 * palette colours and `OFFICE_RIG` points at another source rig. Runs under node, not bun: bun's
 * maths differs from V8's in the last bit, which would change the output bytes.
 */
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { buildRobot } from "../src/robot/build-robot.ts"
import { createRobotIo } from "../src/robot/document/robot-io.ts"
import { parseRobotBuildOptions } from "../src/robot/robot-build-options.ts"

const packageRoot = resolve(import.meta.dirname, "..")
const options = parseRobotBuildOptions(process.env)
const outputPath =
  process.argv[2] ?? resolve(packageRoot, "out/raw", options.lite ? "robot-lite.glb" : "robot.glb")
const rigPath = options.rigPath ?? resolve(packageRoot, "rig/character-rig.glb")

const io = await createRobotIo()
const robot = await buildRobot(io, rigPath, options)
console.info(
  "CHARGE_PLUG",
  JSON.stringify(robot.chargePlug.position.map((value) => +value.toFixed(3))),
  "max drift",
  robot.chargePlug.maxDrift.toFixed(3),
)
mkdirSync(dirname(outputPath), { recursive: true })
await io.write(outputPath, robot.document)
console.info("wrote", outputPath, robot.meshStats)
console.info(robot.clipReport.join("\n"))
