import type { NextConfig } from "next"
import packageJson from "./package.json" with { type: "json" }

const basePath = "/the-delegation"

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  /** Stops `next dev` from writing an AGENTS.md into the repo. */
  agentRules: false,
  /** Regression test for AUDIT.md REL-02: the dev double-mount must leave exactly one canvas and one agent loop. */
  reactStrictMode: true,
  /** Public, non-secret build constants only. Never put API keys here: `env` values are inlined into the client bundle. */
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
}

export default nextConfig
