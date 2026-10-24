import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import { type TimeOfDay, timeOfDayAt, watchTimeOfDay } from "../../src/integration/time-of-day"

function localTime(hours: number, minutes: number): Date {
  return new Date(2026, 9, 24, hours, minutes)
}

describe("timeOfDayAt", () => {
  test("switches at 07:00 and 19:00 local time", () => {
    expect(timeOfDayAt(localTime(6, 59))).toBe("night")
    expect(timeOfDayAt(localTime(7, 0))).toBe("day")
    expect(timeOfDayAt(localTime(18, 59))).toBe("day")
    expect(timeOfDayAt(localTime(19, 0))).toBe("night")
    expect(timeOfDayAt(localTime(0, 0))).toBe("night")
  })
})

describe("watchTimeOfDay", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test("reports immediately, then only when the time of day changes", () => {
    let clock = localTime(18, 57)
    const reports: TimeOfDay[] = []
    const stop = watchTimeOfDay(
      (timeOfDay) => reports.push(timeOfDay),
      () => clock,
    )
    expect(reports).toEqual(["day"])

    clock = localTime(18, 58)
    jest.advanceTimersByTime(60_000)
    clock = localTime(18, 59)
    jest.advanceTimersByTime(60_000)
    expect(reports).toEqual(["day"])

    clock = localTime(19, 0)
    jest.advanceTimersByTime(60_000)
    clock = localTime(19, 1)
    jest.advanceTimersByTime(60_000)
    expect(reports).toEqual(["day", "night"])

    stop()
    clock = localTime(7, 0)
    jest.advanceTimersByTime(60_000)
    expect(reports).toEqual(["day", "night"])
  })
})
