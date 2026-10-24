import { pickRandom, type RandomSource } from "../seeded-random.ts"
import { svgDocument } from "./svg-document.ts"

const NIGHT_GRADIENT_STOPS =
  '<stop offset="0" stop-color="#070b1d"/><stop offset="0.6" stop-color="#18183f"/><stop offset="1" stop-color="#3b2763"/>'
const DAY_GRADIENT_STOPS =
  '<stop offset="0" stop-color="#6fbcff"/><stop offset="0.7" stop-color="#bfe3ff"/><stop offset="1" stop-color="#e8f5ff"/>'

/**
 * The city skyline behind the back walls: a sky gradient with stars (night) or clouds (day), a far
 * row of buildings and a near row with windows, a share of them lit at night.
 */
export function skylineSvg(random: RandomSource, night: boolean): string {
  const width = 1024
  const height = 384
  let body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${night ? NIGHT_GRADIENT_STOPS : DAY_GRADIENT_STOPS}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/>`
  if (night) {
    for (let i = 0; i < 80; i++) {
      body += `<circle cx="${random() * width}" cy="${random() * height * 0.45}" r="${0.6 + random() * 1.2}" fill="#ffffff" opacity="${0.4 + random() * 0.6}"/>`
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const x = random() * width
      const y = 30 + random() * 90
      body += `<g fill="#ffffff" opacity="0.85"><ellipse cx="${x}" cy="${y}" rx="60" ry="16"/><ellipse cx="${x + 30}" cy="${y - 10}" rx="34" ry="16"/></g>`
    }
  }
  for (const layer of [0, 1]) {
    let x = -20
    while (x < width) {
      const buildingWidth = 40 + random() * 90
      const buildingHeight = (layer ? 120 : 170) + random() * (layer ? 140 : 160)
      const y = height - buildingHeight
      const fill = night ? (layer ? "#141a33" : "#0d1226") : layer ? "#8fa3c0" : "#a9bbd4"
      body += `<rect x="${x}" y="${y}" width="${buildingWidth}" height="${buildingHeight}" fill="${fill}"/>`
      if (layer === 1) {
        for (let windowY = y + 10; windowY < height - 8; windowY += 14) {
          for (let windowX = x + 6; windowX < x + buildingWidth - 10; windowX += 12) {
            const lit = random() < (night ? 0.28 : 0.0)
            const windowFill = night
              ? lit
                ? pickRandom(random, ["#ffd27a", "#ffe7a8", "#7fd6ff"])
                : "#1d2442"
              : "#d9e5f3"
            body += `<rect x="${windowX}" y="${windowY}" width="6" height="8" fill="${windowFill}"/>`
          }
        }
      }
      x += buildingWidth + (layer ? 6 : -10)
    }
  }
  return svgDocument(width, height, body)
}
