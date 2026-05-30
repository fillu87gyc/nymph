import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
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
