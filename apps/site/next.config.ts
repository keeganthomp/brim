import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  poweredByHeader: false,
  devIndicators: false,
  ...(process.env.NODE_ENV === 'development' && process.env.BRIM_LOCAL_DOCS_ASSET_PREFIX
    ? { assetPrefix: process.env.BRIM_LOCAL_DOCS_ASSET_PREFIX }
    : {}),
};

export default createMDX()(config);
