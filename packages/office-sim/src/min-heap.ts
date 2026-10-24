/**
 * A binary min-heap of integer items keyed by a numeric priority: the open set of the A* search,
 * where every pop must return the cheapest frontier cell without sorting the whole frontier.
 */
export class MinHeap {
  private readonly priorities: number[] = []
  private readonly items: number[] = []

  /** How many entries are waiting. */
  get size(): number {
    return this.items.length
  }

  /** Adds an item; the same item may be pushed again with a better priority. */
  push(priority: number, item: number): void {
    this.priorities.push(priority)
    this.items.push(item)
    let child = this.items.length - 1
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.priorityAt(parent) <= this.priorityAt(child)) break
      this.swap(parent, child)
      child = parent
    }
  }

  /** Removes and returns the item with the lowest priority, or null when the heap is empty. */
  pop(): number | null {
    const top = this.items[0]
    if (top === undefined) return null
    const lastPriority = this.priorities.pop() ?? 0
    const lastItem = this.items.pop() ?? 0
    if (this.items.length > 0) {
      this.priorities[0] = lastPriority
      this.items[0] = lastItem
      this.siftDown()
    }
    return top
  }

  private siftDown(): void {
    let parent = 0
    for (;;) {
      const left = 2 * parent + 1
      const right = left + 1
      let smallest = parent
      if (left < this.items.length && this.priorityAt(left) < this.priorityAt(smallest)) {
        smallest = left
      }
      if (right < this.items.length && this.priorityAt(right) < this.priorityAt(smallest)) {
        smallest = right
      }
      if (smallest === parent) return
      this.swap(smallest, parent)
      parent = smallest
    }
  }

  private priorityAt(position: number): number {
    return this.priorities[position] ?? Number.POSITIVE_INFINITY
  }

  private swap(first: number, second: number): void {
    const firstPriority = this.priorityAt(first)
    const firstItem = this.items[first] ?? 0
    this.priorities[first] = this.priorityAt(second)
    this.items[first] = this.items[second] ?? 0
    this.priorities[second] = firstPriority
    this.items[second] = firstItem
  }
}
