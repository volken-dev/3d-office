import { expect, test } from "bun:test"
import { MinHeap } from "../src/min-heap"

test("MinHeap pops items by ascending priority", () => {
  const heap = new MinHeap()
  const priorities = [5, 1, 9, 3, 7, 2, 8, 0, 6, 4]
  for (const [item, priority] of priorities.entries()) heap.push(priority, item)
  const popped: number[] = []
  while (heap.size > 0) {
    const item = heap.pop()
    if (item !== null) popped.push(priorities[item] ?? -1)
  }
  expect(popped).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(heap.pop()).toBeNull()
})
