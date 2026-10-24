import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  /** Stops `next dev` from writing an AGENTS.md into the repo. */
  agentRules: false,
  /** Regression test for AUDIT.md REL-02: the dev double-mount must leave exactly one canvas. */
  reactStrictMode: true,
}

export default nextConfig
