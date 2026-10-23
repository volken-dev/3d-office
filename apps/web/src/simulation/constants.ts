import { assetUrl } from "../lib/asset"
import type { AtlasCoords } from "../types"

/** Vertical offset from position origin to character center (for raycasting/picking). */
export const CHARACTER_Y_OFFSET = 0.9
/** Vertical offset from position origin to name/chat bubble anchor. */
export const BUBBLE_Y_OFFSET = 1.3
/** World-space sphere radius used for mouse-picking characters. */
export const PICK_RADIUS = 0.65
/** World-space sphere radius used for mouse-picking POIs. */
export const POI_PICK_RADIUS = 0.4

export const OFFICE_MODEL_URL = assetUrl("models/office.glb")

export const ATLAS_COLS = 2
export const ATLAS_ROWS = 4
/** Atlas cell used for the blink frame (eyes closed). */
export const BLINK_FRAME: AtlasCoords = { col: 1, row: 3 }
/** Seconds the blink frame is held. */
export const BLINK_DURATION = 0.15
/** Seconds per speaking mouth frame. */
export const SPEAKING_FRAME_DURATION = 0.12
/** Random blink interval range [min, min+range] in seconds. */
export const BLINK_INTERVAL_MIN = 2
export const BLINK_INTERVAL_RANGE = 3

export const SCENE_BACKGROUND_COLOR = 0xfafcfb
/** Squared XZ distance (0.6 m) below which two characters fade so neither hides the other. */
export const OVERLAP_DIST_SQ = 0.36
export const OVERLAP_ALPHA = 0.4
/** Per-second rate at which character alpha eases toward its target. */
export const ALPHA_LERP_RATE = 2.0
/**
 * Directions around an area that wandering NPCs spread across, picked by agent index. Equal to the
 * team size limit (`MAX_AGENTS`), so each agent keeps its own direction.
 */
export const WANDER_SPREAD_DIRECTIONS = 5
/** How far in front of an NPC the player stops when walking over to chat. */
export const CHAT_STANDOFF = 1.2
