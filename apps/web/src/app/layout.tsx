import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

/** Public origin of the deployed site; when unset, social previews use relative URLs. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
const TITLE = "The Delegation"
const DESCRIPTION = "A 3D office in the browser"
const OG_IMAGE = {
  url: "/og.jpg",
  type: "image/jpeg",
  width: 1200,
  height: 630,
}

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: TITLE,
  description: DESCRIPTION,
  referrer: "strict-origin-when-cross-origin",
  openGraph: {
    type: "website",
    url: "/",
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
 * Server component: must not import from src/integration, src/interface or the scene package
 * (they touch window and WebGPU). Everything interactive lives behind ClientApp's ssr:false boundary.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
