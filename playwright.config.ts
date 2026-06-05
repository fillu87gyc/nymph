import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Discover the newest available Chromium binary under PLAYWRIGHT_BROWSERS_PATH.
// This allows the same config to work in environments where the browser revision
// pre-installed by the image doesn't match the Playwright version in package.json
// (e.g. dev container has rev 1194, CI runner has rev 1223).
function findAvailableChromium(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath) return undefined;
  try {
    const bin = readdirSync(browsersPath)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse() // newest revision first
      .map((d) => join(browsersPath, d, 'chrome-linux', 'chrome'))
      .find((p) => existsSync(p));
    return bin;
  } catch {
    return undefined;
  }
}

const executablePath = findAvailableChromium();

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
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
