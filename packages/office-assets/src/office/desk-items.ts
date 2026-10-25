import type { FrameBuilder } from "./frame-builder.ts"
import { PLANT_GROWERS } from "./plants.ts"

/** Puts one personal item on a work pod's console, in the pod's local frame. */
type DeskItem = (builder: FrameBuilder) => void

function mug(builder: FrameBuilder): void {
  builder.superEllipsoid("fabric_coral", [0.5, 0.545, -0.36], [0.035, 0.04, 0.035], 0.15, 1, 6, 14)
}

function tinyPlant(builder: FrameBuilder): void {
  builder.superEllipsoid("pot", [0.52, 0.56, -0.38], [0.055, 0.055, 0.055], 0.15, 0.55, 6, 14)
  PLANT_GROWERS.leafy(builder, 0.52, 0.6, -0.38, 0.3)
}

function rubberDuck(builder: FrameBuilder): void {
  builder
    .superEllipsoid("mug_yellow", [0.5, 0.54, -0.36], [0.045, 0.035, 0.04], 0.6, 0.8, 8, 14)
    .superEllipsoid("mug_yellow", [0.5, 0.59, -0.375], [0.03, 0.03, 0.03], 0.6, 1, 8, 14)
    .superEllipsoid("fabric_coral", [0.5, 0.59, -0.34], [0.014, 0.008, 0.016], 0.6, 1, 4, 8)
}

function headphones(builder: FrameBuilder): void {
  for (const x of [0.42, 0.58]) {
    builder.superEllipsoid("furn_dark", [x, 0.53, -0.36], [0.035, 0.035, 0.022], 0.6, 1, 6, 12)
  }
  builder.box("furn_dark", [0.5, 0.585, -0.36], [0.14, 0.014, 0.025])
}

function deskLamp(builder: FrameBuilder): void {
  builder
    .superEllipsoid("furn_dark", [0.52, 0.51, -0.62], [0.07, 0.01, 0.07], 0.3, 1, 4, 14)
    .box("metal", [0.52, 0.62, -0.62], [0.02, 0.22, 0.02])
    .superEllipsoid("lamp_glow", [0.52, 0.73, -0.56], [0.06, 0.03, 0.06], 0.3, 1, 6, 14)
}

function books(builder: FrameBuilder): void {
  builder
    .box("book_2", [0.5, 0.52, -0.36], [0.18, 0.025, 0.13])
    .box("book_1", [0.51, 0.545, -0.35], [0.16, 0.025, 0.12])
}

/** One personal item per pod, cycling through the list by pod id (kept sparse on purpose). */
export const DESK_ITEMS: readonly DeskItem[] = [
  mug,
  tinyPlant,
  rubberDuck,
  headphones,
  deskLamp,
  books,
]
