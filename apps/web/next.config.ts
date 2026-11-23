import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import path from 'node:path';
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default function configure(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return config;
  const sitePort = Number(process.env.BRIM_SITE_PORT ?? 3200);
  if (!Number.isInteger(sitePort) || sitePort < 1024 || sitePort > 65535) {
    throw new Error('BRIM_SITE_PORT must be an integer between 1024 and 65535.');
  }
  const siteOrigin = `http://127.0.0.1:${sitePort}`;
  return {
    ...config,
    skipTrailingSlashRedirect: true,
    async rewrites() {
      return [
        { source: '/docs/:path*/', destination: `${siteOrigin}/docs/:path*/` },
        { source: '/docs/:path*', destination: `${siteOrigin}/docs/:path*` },
        {
          source: '/brim-docs-assets/:path*',
          destination: `${siteOrigin}/brim-docs-assets/:path*`,
        },
        { source: '/llms.txt', destination: `${siteOrigin}/llms.txt` },
        { source: '/llms-full.txt', destination: `${siteOrigin}/llms-full.txt` },
      ];
    },
  };
}
