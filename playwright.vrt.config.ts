import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findAvailableChromium(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath) return undefined;
  try {
    const bin = readdirSync(browsersPath)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse()
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
  testMatch: ['**/*_vrt.test.ts'],
  // Run VRT tests serially so baseline generation (also serial) and test
  // execution use the same CPU conditions, preventing Mermaid rendering
  // non-determinism that occurs under parallel load.
  workers: 1,
  use: {
    baseURL: 'http://localhost:6276', // overridden per-worker in fixtures.ts
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
