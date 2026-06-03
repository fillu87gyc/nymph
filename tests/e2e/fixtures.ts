/**
 * Per-worker server isolation fixture.
 *
 * Each Playwright worker gets its own:
 *   - nymph server on port 6276 + workerIndex
 *   - fixture file copy  (tests/fixtures/sample-w{n}.md)
 *   - comments file      (sample-w{n}.md.comments.json)
 *
 * Overriding the built-in `context` fixture sets baseURL per worker so that
 * page.goto('/') always resolves to the correct isolated server.
 */

import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from '@playwright/test';

const SAMPLE_PATH = join(process.cwd(), 'tests/fixtures/sample.md');
const BASE_PORT = 6276;

type WorkerFixtures = {
  _workerServer: { port: number; fixturePath: string };
};

type TestFixtures = {
  context: BrowserContext;
  fixturePath: string;
  commentsPath: string;
};

async function pollUntilReady(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms: ${url}`);
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  _workerServer: [
    async (_fixtures, use, workerInfo) => {
      const port = BASE_PORT + workerInfo.workerIndex;
      const fixturePath = join(
        process.cwd(),
        `tests/fixtures/sample-w${workerInfo.workerIndex}.md`,
      );

      writeFileSync(fixturePath, readFileSync(SAMPLE_PATH, 'utf-8'));

      const proc = spawn(
        'bun',
        ['src/cli.ts', '-p', String(port), fixturePath],
        {
          env: { ...process.env, NYMPH_NO_OPEN: '1' },
          stdio: 'ignore',
        },
      );

      await pollUntilReady(`http://localhost:${port}/`);

      await use({ port, fixturePath });

      proc.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((r) => proc.once('exit', r)),
        new Promise<void>((r) => setTimeout(r, 5000)),
      ]);

      for (const p of [
        fixturePath,
        `${fixturePath}.comments.json`,
        `${fixturePath}.nymph-lock`,
      ]) {
        try {
          rmSync(p);
        } catch {
          /* ignore */
        }
      }
    },
    { scope: 'worker' },
  ],

  // Override built-in context to set per-worker baseURL
  context: async ({ browser, _workerServer }, use) => {
    const ctx = await browser.newContext({
      baseURL: `http://localhost:${_workerServer.port}`,
    });
    await use(ctx);
    await ctx.close();
  },

  fixturePath: async ({ _workerServer }, use) => {
    await use(_workerServer.fixturePath);
  },

  commentsPath: async ({ _workerServer }, use) => {
    await use(`${_workerServer.fixturePath}.comments.json`);
  },
});

export { expect, type Page };
