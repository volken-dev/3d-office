import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { assetUrl, BASE_PATH } from "@/lib/asset"
import "./globals.css"

const SITE_ORIGIN = "https://arturitu.github.io"
const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}/`
const TITLE = "The Delegation"
const DESCRIPTION =
  "A no-code 3D playground to explore, design, and interact with Agentic AI systems"
/** Absolute on purpose: crawlers need full URLs, and a metadataBase with a path drops the base path when joined with '/og.jpg'. */
const OG_IMAGE = {
  url: `${SITE_ORIGIN}${assetUrl("og.jpg")}`,
  type: "image/jpeg",
  width: 1200,
  height: 630,
}

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  referrer: "strict-origin-when-cross-origin",
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    site: "@arturitu",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
}

/**
 * Server component: must not import from src/core, src/integration, src/interface or src/simulation
 * (they touch window/localStorage/WebGPU). Everything interactive lives behind ClientApp's ssr:false boundary.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
