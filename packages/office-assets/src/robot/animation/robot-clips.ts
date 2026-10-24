import type { PropJointNodes } from "../document/prop-joints.ts"
import { addCelebrationClips } from "./celebration-clips.ts"
import { addChargingClips } from "./charging-clips.ts"
import type { ClipContext } from "./keyed-clips.ts"
import { reverseClip } from "./reversed-clip.ts"
import { addSitSadClip } from "./sit-sad-clip.ts"
import { addWaitingClips } from "./waiting-clips.ts"
import { addWorkbenchClips } from "./workbench-clips.ts"

/**
 * Adds the 12 clips the source rig lacks, after its 12 originals (whose body channels are never
 * modified): Dance, Jump, Celebrate, Stand, Charge, Plug_In, Plug_Out, Sit_Wait, Wait, Sit_Sad,
 * Hammer and Tinker, in that order (the file's clip order).
 */
export function addRobotClips(context: ClipContext, props: PropJointNodes): void {
  addCelebrationClips(context)
  reverseClip(context, "Stand", "Sit")
  addChargingClips(context, props)
  addWaitingClips(context, props)
  addSitSadClip(context, props)
  addWorkbenchClips(context, props)
}
