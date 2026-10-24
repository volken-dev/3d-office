/** The office's lighting mode. */
export type TimeOfDay = "day" | "night"

const DAY_STARTS_AT_HOUR = 7
const NIGHT_STARTS_AT_HOUR = 19
const CHECK_INTERVAL_MS = 60_000

/** Night when the local hour is before 07:00 or from 19:00, day otherwise. */
export function timeOfDayAt(date: Date): TimeOfDay {
  const hour = date.getHours()
  return hour < DAY_STARTS_AT_HOUR || hour >= NIGHT_STARTS_AT_HOUR ? "night" : "day"
}

/**
 * Reports the time of day now, then checks every minute and reports again only when it changes.
 * `now` is injectable for tests. Returns the function that stops watching.
 */
export function watchTimeOfDay(
  onChange: (timeOfDay: TimeOfDay) => void,
  now: () => Date = () => new Date(),
): () => void {
  let current = timeOfDayAt(now())
  onChange(current)
  const intervalId = setInterval(() => {
    const next = timeOfDayAt(now())
    if (next === current) return
    current = next
    onChange(current)
  }, CHECK_INTERVAL_MS)
  return () => clearInterval(intervalId)
}
