/** A deterministic random source returning values in (0, 1). */
export type RandomSource = () => number

/**
 * A Park-Miller (minimal standard) generator. The generators are seeded so a rebuild is byte for
 * byte the same; every draw advances the sequence, so the order of calls is part of the output.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

/** One element of a non-empty list, picked with one draw from `random`. */
export function pickRandom<Element>(random: RandomSource, list: readonly Element[]): Element {
  const element = list[Math.floor(random() * list.length)]
  if (element === undefined) throw new Error("pickRandom needs a non-empty list")
  return element
}
