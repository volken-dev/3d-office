import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const SITE_URL = 'https://arturitu.github.io/the-delegation/';
const TITLE = 'The Delegation';
const DESCRIPTION = 'A no-code 3D playground to explore, design, and interact with Agentic AI systems';
// Absolute on purpose: a metadataBase with a path drops '/the-delegation' when joined with '/og.jpg'.
const OG_IMAGE = { url: `${SITE_URL}og.jpg`, type: 'image/jpeg', width: 1200, height: 630 };

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  referrer: 'strict-origin-when-cross-origin',
  openGraph: { type: 'website', url: SITE_URL, title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: {
    card: 'summary_large_image',
    site: '@arturitu',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

// Server component: must not import from src/core, src/integration, src/interface or src/simulation
// (they touch window/localStorage/WebGPU). Everything interactive lives behind ClientApp's ssr:false boundary.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
