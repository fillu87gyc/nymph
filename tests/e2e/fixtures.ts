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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  _workerServer: {
    port: number;
    fixturePath: string;
    dictDir: string;
    nymphConfigDir: string;
  };
};

type TestFixtures = {
  context: BrowserContext;
  fixturePath: string;
  commentsPath: string;
  dictDir: string;
  dictPath: string;
  /** サーバープロセスが使う XDG_CONFIG_HOME（承認済みハッシュの保存先） */
  nymphConfigDir: string;
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
    async ({ browserName: _browserName }, use, workerInfo) => {
      const port = BASE_PORT + workerInfo.workerIndex;
      const fixturePath = join(
        process.cwd(),
        `tests/fixtures/sample-w${workerInfo.workerIndex}.md`,
      );
      const dictDir = join(process.cwd(), `.nymph-w${workerInfo.workerIndex}`);
      const nymphConfigDir = join(
        process.cwd(),
        `.nymph-config-w${workerInfo.workerIndex}`,
      );

      writeFileSync(fixturePath, readFileSync(SAMPLE_PATH, 'utf-8'));
      mkdirSync(dictDir, { recursive: true });
      mkdirSync(nymphConfigDir, { recursive: true });

      const proc = spawn(
        'bun',
        ['src/cli.ts', '-p', String(port), fixturePath],
        {
          env: {
            ...process.env,
            NYMPH_NO_OPEN: '1',
            NYMPH_DICT_DIR: dictDir,
            XDG_CONFIG_HOME: nymphConfigDir,
          },
          stdio: 'ignore',
        },
      );

      await pollUntilReady(`http://localhost:${port}/`);

      await use({ port, fixturePath, dictDir, nymphConfigDir });

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
      for (const d of [dictDir, nymphConfigDir]) {
        try {
          rmSync(d, { recursive: true });
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

  dictDir: async ({ _workerServer }, use) => {
    await use(_workerServer.dictDir);
  },

  dictPath: async ({ _workerServer }, use) => {
    await use(join(_workerServer.dictDir, 'dict.json'));
  },

  nymphConfigDir: async ({ _workerServer }, use) => {
    await use(_workerServer.nymphConfigDir);
  },
});

export { expect, type Page };
