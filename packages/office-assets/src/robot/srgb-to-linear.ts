/**
 * Converts a `0xRRGGBB` sRGB colour to linear RGB, the space glTF colour factors are stored in.
 */
export function srgbToLinear(hexColor: number): [number, number, number] {
  const [red, green, blue] = [(hexColor >> 16) & 255, (hexColor >> 8) & 255, hexColor & 255].map(
    (channel) => {
      const unit = channel / 255
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    },
  )
  return [red, green, blue]
}
