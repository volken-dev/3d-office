import { emitAntenna } from "./antenna.ts"
import { emitArms } from "./arms.ts"
import type { BodyBuilder } from "./body-builder.ts"
import { emitChargingCable } from "./charging-cable.ts"
import { emitFace, type FaceTargetPositions } from "./face.ts"
import { emitHammer } from "./hammer.ts"
import type { HammerGrip } from "./hammer-grip.ts"
import { emitHeadShell } from "./head-shell.ts"
import { emitLegs } from "./legs.ts"
import { emitNeck } from "./neck.ts"
import { emitSleepLetters } from "./sleep-letters.ts"
import { emitStatusGlyphs } from "./status-glyphs.ts"
import { emitToolIcons } from "./tool-icons.ts"
import { emitTorso } from "./torso.ts"

/**
 * Emits every part of the robot, head to feet and then the face. The order is part of the
 * output: it decides vertex order and which material each primitive comes first in.
 */
export function emitRobotGeometry(
  body: BodyBuilder,
  hammerGrip: HammerGrip,
): FaceTargetPositions[] {
  emitHeadShell(body)
  emitAntenna(body)
  emitSleepLetters(body)
  emitStatusGlyphs(body)
  emitToolIcons(body)
  emitChargingCable(body)
  emitHammer(body, hammerGrip)
  emitNeck(body)
  emitTorso(body)
  emitArms(body)
  emitLegs(body)
  return emitFace(body)
}
