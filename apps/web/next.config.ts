import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

const basePath = '/the-delegation';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Stops `next dev` from writing an AGENTS.md into the repo.
  agentRules: false,
  // Off until SceneManager.dispose() also tears down AgentSimulation; a strict-mode remount would double Gemini calls.
  reactStrictMode: false,
  // Public, non-secret build constants only. Never put API keys here: `env` values are inlined into the client bundle.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
