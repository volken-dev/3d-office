import type { IAgentDriver } from "../../types"
import type { CharacterController } from "../CharacterController"

import { NpcAgentDriver } from "./NpcAgentDriver"
import { PlayerInputDriver } from "./PlayerInputDriver"

/** Owns the per-character drivers (one player, the rest NPCs) and ticks them after each position readback. */
export class DriverManager {
  private drivers = new Map<number, IAgentDriver>()
  private playerDriver: PlayerInputDriver | null = null

  constructor(private readonly controller: CharacterController) {}

  /** Register the player driver. Returns it so SceneManager can wire InputManager callbacks. */
  public registerPlayer(index: number): PlayerInputDriver {
    const driver = new PlayerInputDriver(index, this.controller)
    this.drivers.set(index, driver)
    this.playerDriver = driver
    return driver
  }

  public registerNpc(agentIndex: number, isLead: boolean): NpcAgentDriver {
    const driver = new NpcAgentDriver(agentIndex, this.controller, isLead)
    this.drivers.set(agentIndex, driver)
    return driver
  }

  public getPlayerDriver(): PlayerInputDriver | null {
    return this.playerDriver
  }

  public getNpcDriver(agentIndex: number): NpcAgentDriver | null {
    const driver = this.drivers.get(agentIndex)
    return driver instanceof NpcAgentDriver ? driver : null
  }

  public *npcDrivers(): Generator<NpcAgentDriver> {
    for (const driver of this.drivers.values()) {
      if (driver instanceof NpcAgentDriver) yield driver
    }
  }

  /** Call after each GPU position readback. */
  public update(positions: Float32Array, deltaSeconds: number): void {
    for (const driver of this.drivers.values()) {
      driver.update(positions, deltaSeconds)
    }
  }

  public dispose(): void {
    for (const driver of this.drivers.values()) {
      driver.dispose()
    }
    this.drivers.clear()
    this.playerDriver = null
  }
}
