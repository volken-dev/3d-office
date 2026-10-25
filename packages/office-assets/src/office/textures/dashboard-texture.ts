import { pickRandom, type RandomSource } from "../seeded-random.ts"
import { svgDocument } from "./svg-document.ts"

/** `status`: a kanban status board; `chart`: the meeting-room chart dashboard. */
export type DashboardKind = "status" | "chart"

/** Kanban column header colours: to do, doing, review, done. */
const STATUS_COLUMN_COLOURS = ["#8b949e", "#3fe0ff", "#d2a8ff", "#7ee787"]

/** A dashboard screen: a kanban board of cards, or bar and line charts with a donut and a list. */
export function dashboardSvg(random: RandomSource, kind: DashboardKind): string {
  const width = 512
  const height = 288
  let body = `<rect width="${width}" height="${height}" fill="#0f1420"/><rect width="${width}" height="30" fill="#18202f"/>`
  body += `<rect x="14" y="10" width="${kind === "status" ? 120 : 90}" height="10" rx="5" fill="#e6edf3"/>`
  if (kind === "status") {
    STATUS_COLUMN_COLOURS.forEach((colour, column) => {
      const x = 14 + column * 124
      body += `<rect x="${x}" y="42" width="114" height="${height - 54}" rx="8" fill="#151c2b"/><rect x="${x + 10}" y="52" width="50" height="8" rx="4" fill="${colour}"/>`
      const cardCount = 2 + Math.floor(random() * 3)
      for (let card = 0; card < cardCount; card++) {
        const y = 70 + card * 46
        body += `<rect x="${x + 8}" y="${y}" width="98" height="38" rx="6" fill="#1f2838"/><rect x="${x + 8}" y="${y}" width="4" height="38" rx="2" fill="${colour}"/><rect x="${x + 18}" y="${y + 9}" width="${40 + random() * 40}" height="6" rx="3" fill="#c9d1d9"/><rect x="${x + 18}" y="${y + 22}" width="${30 + random() * 30}" height="6" rx="3" fill="#6e7681"/>`
      }
    })
  } else {
    body += `<rect x="14" y="42" width="300" height="${height - 56}" rx="8" fill="#151c2b"/>`
    for (let i = 0; i < 8; i++) {
      const barHeight = 30 + random() * 150
      body += `<rect x="${32 + i * 34}" y="${height - 28 - barHeight}" width="22" height="${barHeight}" rx="4" fill="${i % 3 === 0 ? "#3fe0ff" : "#5b8cff"}"/>`
    }
    let points = ""
    for (let i = 0; i < 9; i++) points += `${30 + i * 34},${110 + Math.sin(i * 0.9) * 40 - i * 6} `
    body += `<polyline points="${points}" fill="none" stroke="#ffc93c" stroke-width="4" stroke-linejoin="round"/>`
    body += `<rect x="326" y="42" width="172" height="104" rx="8" fill="#151c2b"/><circle cx="380" cy="94" r="36" fill="none" stroke="#2a3346" stroke-width="14"/><circle cx="380" cy="94" r="36" fill="none" stroke="#7ee787" stroke-width="14" stroke-dasharray="160 400" transform="rotate(-90 380 94)"/><rect x="430" y="80" width="54" height="10" rx="5" fill="#e6edf3"/><rect x="430" y="98" width="38" height="8" rx="4" fill="#6e7681"/>`
    body += `<rect x="326" y="156" width="172" height="${height - 170}" rx="8" fill="#151c2b"/>`
    for (let i = 0; i < 4; i++) {
      body += `<rect x="340" y="${172 + i * 22}" width="${60 + random() * 80}" height="8" rx="4" fill="${pickRandom(random, ["#c9d1d9", "#6e7681", "#d2a8ff"])}"/>`
    }
  }
  return svgDocument(width, height, body)
}
