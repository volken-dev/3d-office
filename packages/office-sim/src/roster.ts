/**
 * Sessions to agent slots. The office seats `max` agents (slot N = pod N, bay N, status light N);
 * sessions beyond that queue FIFO in the lobby. When a seated session ends, the head of the queue
 * takes its slot and everyone behind moves up. A seated session's agent gets desk = its slot; a
 * queued one gets desk = its queue position and state `queued` (`OfficeAgent.setDesk` re-targets it
 * as the queue moves). Ported from agent-office's reference `Roster`.
 */
export class Roster<SessionId> {
  private readonly slots = new Map<SessionId, number>()
  private queue: SessionId[] = []

  /** @param max the number of slots, the office's `agents.max`. */
  constructor(readonly max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`Roster: max must be a positive integer, got ${max}`)
    }
  }

  /** The sessions waiting, front of the queue first. */
  get queued(): readonly SessionId[] {
    return this.queue
  }

  /**
   * Seats a new session: in `slot` when given and free, else in the first free slot. Returns the
   * slot, or null when the session has to queue (see `position`). Joining twice changes nothing.
   */
  join(session: SessionId, slot: number | null = null): number | null {
    const seated = this.slots.get(session)
    if (seated !== undefined) return seated
    if (this.queue.includes(session)) return null
    const free = slot !== null && !this.isTaken(slot) ? slot : this.firstFree()
    if (free !== null) {
      this.slots.set(session, free)
      return free
    }
    this.queue.push(session)
    return null
  }

  /**
   * Ends a session. Returns the promoted session and the slot it takes when the queue head moves
   * into the freed slot, else null.
   */
  leave(session: SessionId): { promoted: SessionId; slot: number } | null {
    const slot = this.slots.get(session)
    if (slot === undefined) {
      this.queue = this.queue.filter((queuedSession) => queuedSession !== session)
      return null
    }
    this.slots.delete(session)
    const promoted = this.queue.shift()
    if (promoted === undefined) return null
    this.slots.set(promoted, slot)
    return { promoted, slot }
  }

  /** The slot a session holds, or null when it is queued or unknown. */
  slotOf(session: SessionId): number | null {
    return this.slots.get(session) ?? null
  }

  /** A queued session's place in the queue (1 = the front), or null when it is not queued. */
  position(session: SessionId): number | null {
    const queueIndex = this.queue.indexOf(session)
    return queueIndex < 0 ? null : queueIndex + 1
  }

  /** Whether some session holds the slot. */
  isTaken(slot: number): boolean {
    for (const heldSlot of this.slots.values()) if (heldSlot === slot) return true
    return false
  }

  /** The lowest free slot, or null when all `max` are held. */
  firstFree(): number | null {
    for (let slot = 1; slot <= this.max; slot++) if (!this.isTaken(slot)) return slot
    return null
  }
}
