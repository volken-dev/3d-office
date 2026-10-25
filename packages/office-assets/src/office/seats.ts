import type { FrameBuilder } from "./frame-builder.ts"

/**
 * A swivel office chair: the robot sits at the origin facing +z, backrest at -z. Its footprint is
 * an obstacle (agents walk round chairs; the seat POI gets an approach point). The five legs don't
 * meet in the middle, so they share no faces.
 */
export function officeChair(builder: FrameBuilder, fabric: string): void {
  builder.block(-0.23, -0.33, 0.23, 0.22)
  for (let leg = 0; leg < 5; leg++) {
    builder.child(0, 0, leg * 72).box("furn_dark", [0, 0.045, 0.14], [0.04, 0.03, 0.2])
  }
  builder.superEllipsoid("furn_dark", [0, 0.045, 0], [0.055, 0.02, 0.055], 0.4, 1, 4, 14)
  builder.box("metal", [0, 0.16, 0], [0.05, 0.22, 0.05])
  builder.superEllipsoid(fabric, [0, 0.275, -0.02], [0.22, 0.035, 0.22], 0.4, 0.35, 6, 14)
  builder.box("furn_dark", [0, 0.38, -0.27], [0.05, 0.2, 0.03])
  builder.superEllipsoid(fabric, [0, 0.56, -0.3], [0.21, 0.19, 0.035], 0.4, 0.35, 6, 14)
}

/**
 * A shell seat on a pedestal, the work pods' seat: the same seat height as {@link officeChair};
 * the robot faces +z with the high back at -z.
 */
export function cockpitSeat(builder: FrameBuilder): void {
  builder.block(-0.24, -0.35, 0.24, 0.24)
  builder
    .superEllipsoid("steel_dark", [0, 0.02, 0], [0.24, 0.02, 0.24], 0.3, 1, 4, 20)
    .box("steel", [0, 0.14, 0], [0.06, 0.22, 0.06])
  builder
    .superEllipsoid("machine", [0, 0.255, -0.01], [0.24, 0.03, 0.23], 0.35, 0.35, 5, 16)
    .superEllipsoid("fabric_chair", [0, 0.292, 0], [0.2, 0.018, 0.19], 0.4, 0.4, 4, 16)
  builder
    .superEllipsoid("machine", [0, 0.58, -0.3], [0.24, 0.28, 0.045], 0.35, 0.35, 7, 16)
    .superEllipsoid("fabric_chair", [0, 0.57, -0.253], [0.19, 0.21, 0.012], 0.4, 0.4, 5, 16)
}
