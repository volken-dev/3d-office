import type { FrameBuilder } from "../frame-builder.ts"
import type { OfficeItem } from "../office-layout-schema.ts"
import {
  buildConveyor,
  buildGuardRail,
  buildLaunchPad,
  buildLineGantry,
  buildPalletStack,
  buildRobotArm,
  buildShelvingRack,
  buildWorkbench,
} from "./agent-factory.ts"
import {
  buildBigPlant,
  buildPlant,
  buildPlanterTrough,
  buildRoundRug,
  buildWallClock,
} from "./decor.ts"
import {
  buildChargeRow,
  buildCoolingUnit,
  buildDataLink,
  buildFlashStation,
} from "./docking-bay.ts"
import {
  buildFloorArrows,
  buildFloorHatch,
  buildFloorLines,
  buildFloorText,
} from "./floor-paint.ts"
import {
  buildLowTable,
  buildScanGate,
  buildSeatRow,
  buildShowcase,
  buildWallScreen,
  buildWayfinding,
} from "./lobby.ts"
import {
  buildBarTable,
  buildControlRoom,
  buildServiceBar,
  buildTrainingPod,
} from "./meeting-and-service.ts"
import { buildDeskGrid } from "./work-pods.ts"

/**
 * Builds one layout item with the builder for its `type`, in a frame at the item's position and
 * turn. Items are local with +z as their front unless their builder says otherwise.
 */
export function buildItem(builder: FrameBuilder, item: OfficeItem): void {
  switch (item.type) {
    case "charge_row":
      buildChargeRow(builder, item)
      break
    case "cooling_unit":
      buildCoolingUnit(builder)
      break
    case "plant":
      buildPlant(builder, item)
      break
    case "desk_grid":
      buildDeskGrid(builder, item)
      break
    case "planter_trough":
      buildPlanterTrough(builder, item)
      break
    case "wall_screen":
      buildWallScreen(builder, item)
      break
    case "training_pod":
      buildTrainingPod(builder, item)
      break
    case "big_plant":
      buildBigPlant(builder, item)
      break
    case "service_bar":
      buildServiceBar(builder)
      break
    case "wall_clock":
      buildWallClock(builder, item)
      break
    case "bar_table":
      buildBarTable(builder)
      break
    case "launch_pad":
      buildLaunchPad(builder, item)
      break
    case "guard_rail":
      buildGuardRail(builder, item)
      break
    case "conveyor":
      buildConveyor(builder, item)
      break
    case "workbench":
      buildWorkbench(builder, item)
      break
    case "shelving_rack":
      buildShelvingRack(builder, item)
      break
    case "pallet_stack":
      buildPalletStack(builder)
      break
    case "robot_arm":
      buildRobotArm(builder, item)
      break
    case "floor_hatch":
      buildFloorHatch(builder, item)
      break
    case "floor_lines":
      buildFloorLines(builder, item)
      break
    case "floor_text":
      buildFloorText(builder, item)
      break
    case "floor_arrows":
      buildFloorArrows(builder, item)
      break
    case "line_gantry":
      buildLineGantry(builder, item)
      break
    case "flash_station":
      buildFlashStation(builder)
      break
    case "data_link":
      buildDataLink(builder, item)
      break
    case "control_room":
      buildControlRoom(builder, item)
      break
    case "scan_gate":
      buildScanGate(builder, item)
      break
    case "round_rug":
      buildRoundRug(builder, item)
      break
    case "seat_row":
      buildSeatRow(builder, item)
      break
    case "low_table":
      buildLowTable(builder, item)
      break
    case "wayfinding":
      buildWayfinding(builder, item)
      break
    case "showcase":
      buildShowcase(builder, item)
      break
  }
}
