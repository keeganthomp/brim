import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/web/server/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    coverage: { include: ['packages/*/src/**/*.ts'] },
  },
});
