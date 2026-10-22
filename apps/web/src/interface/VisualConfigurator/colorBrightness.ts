/** Above this perceived brightness, white text on the colour is unreadable. */
export const MAX_BRIGHTNESS = 200

/** Sits below MAX_BRIGHTNESS as a safety margin, so a suggested colour is never borderline. */
const TARGET_BRIGHTNESS = 190
const LIGHTNESS_SEARCH_STEPS = 10

interface Rgb {
  red: number
  green: number
  blue: number
}

function parseHexChannels(hex: string): Rgb {
  return {
    red: parseInt(hex.slice(1, 3), 16),
    green: parseInt(hex.slice(3, 5), 16),
    blue: parseInt(hex.slice(5, 7), 16),
  }
}

function perceivedBrightness({ red, green, blue }: Rgb): number {
  return (red * 299 + green * 587 + blue * 114) / 1000
}

function channelToHex(channel: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)))
  return clamped.toString(16).padStart(2, "0")
}

function hueOf({ red, green, blue }: Rgb): number {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  if (max === min) return 0
  const range = max - min
  let hue: number
  if (max === red) hue = (green - blue) / range + (green < blue ? 6 : 0)
  else if (max === green) hue = (blue - red) / range + 2
  else hue = (red - green) / range + 4
  return hue / 6
}

/** HSL (0-1) to RGB (0-255). */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  if (saturation === 0) {
    const grey = lightness * 255
    return { red: grey, green: grey, blue: grey }
  }
  const upper =
    lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const lower = 2 * lightness - upper
  const hueToChannel = (offset: number) => {
    const wrapped = offset < 0 ? offset + 1 : offset > 1 ? offset - 1 : offset
    if (wrapped < 1 / 6) return lower + (upper - lower) * 6 * wrapped
    if (wrapped < 1 / 2) return upper
    if (wrapped < 2 / 3) return lower + (upper - lower) * (2 / 3 - wrapped) * 6
    return lower
  }
  return {
    red: hueToChannel(hue + 1 / 3) * 255,
    green: hueToChannel(hue) * 255,
    blue: hueToChannel(hue - 1 / 3) * 255,
  }
}

/**
 * Calculates the perceived brightness of a hex color.
 * Returns a value between 0 and 255.
 */
export function getBrightness(hex: string): number {
  return perceivedBrightness(parseHexChannels(hex))
}

/**
 * Returns a version of the color that is dark enough for white text, but as clear and saturated
 * as possible within that constraint: full saturation, then a binary search for the highest
 * lightness that stays under TARGET_BRIGHTNESS.
 */
export function getDarkenedColor(hex: string): string {
  const channels = parseHexChannels(hex)
  const hue = hueOf({
    red: channels.red / 255,
    green: channels.green / 255,
    blue: channels.blue / 255,
  })
  const saturation = 1
  let low = 0
  let high = 1
  for (let step = 0; step < LIGHTNESS_SEARCH_STEPS; step++) {
    const mid = (low + high) / 2
    if (perceivedBrightness(hslToRgb(hue, saturation, mid)) > TARGET_BRIGHTNESS) high = mid
    else low = mid
  }
  const darkened = hslToRgb(hue, saturation, low)
  return `#${channelToHex(darkened.red)}${channelToHex(darkened.green)}${channelToHex(darkened.blue)}`
}
