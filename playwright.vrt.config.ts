import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*_vrt.test.ts'],
  // Run VRT tests serially so baseline generation (also serial) and test
  // execution use the same CPU conditions, preventing Mermaid rendering
  // non-determinism that occurs under parallel load.
  workers: 1,
  use: {
    baseURL: 'http://localhost:6276', // overridden per-worker in fixtures.ts
  },
});
