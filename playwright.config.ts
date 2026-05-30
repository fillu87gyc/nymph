import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // All E2E tests share a single server and a single fixture file.
  // Parallel execution causes SSE race conditions, so we run sequentially.
  workers: 1,
  use: {
    baseURL: 'http://localhost:6276',
  },
  webServer: {
    command: 'bun run src/cli.ts tests/fixtures/sample.md',
    url: 'http://localhost:6276',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
