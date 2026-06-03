import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // VRT tests run under playwright.vrt.config.ts (workers:1) to ensure
  // baseline generation and test execution use the same CPU conditions.
  testIgnore: ['**/*_vrt.test.ts'],
  // Each worker gets an isolated server via tests/e2e/fixtures.ts.
  // 4 workers run test files in parallel; tests within a file run sequentially.
  workers: 4,
  use: {
    baseURL: 'http://localhost:6276', // overridden per-worker in fixtures.ts
  },
});
