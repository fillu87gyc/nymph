/**
 * Per-worker server isolation fixture.
 *
 * Each Playwright worker gets its own:
 *   - nymph server on port 6276 + workerIndex
 *   - fixture file copy  (tests/fixtures/sample-w{n}.md)
 *   - review store dir   ($nymphConfigDir/nymph/reviews/<reviewKey>/)
 *
 * Review data (comments / checkpoint) no longer lives beside the fixture
 * file — it lives under the worker's XDG_DATA_HOME (`nymphConfigDir`), keyed
 * deterministically by `reviewKey()` (see src/reviewStore.ts). Because the
 * fixture file path is stable for the whole worker's lifetime, comments
 * written by one test persist into the next test unless explicitly cleared;
 * tests that add comments/checkpoints must clean `reviewDir` (or
 * `reviewCommentsPath` / `reviewCheckpointPath`) in beforeEach/afterEach.
 *
 * `commentsPath` (legacy `<file>.comments.json`) is kept only for tests that
 * specifically exercise legacy-sidecar auto-migration.
 *
 * Overriding the built-in `context` fixture sets baseURL per worker so that
 * page.goto('/') always resolves to the correct isolated server.
 *
 * All contexts also serve external CDN assets (Google Fonts / hljs CSS) from
 * vendored local copies and block any other external request — see
 * routeStaticAssets. E2E therefore always runs with the real production
 * fonts loaded (never the fallback-font state) and never depends on network
 * availability or CDN-side changes.
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
import { reviewKey } from '../../src/reviewStore.ts';

const SAMPLE_PATH = join(process.cwd(), 'tests/fixtures/sample.md');
const BASE_PORT = 6276;

/**
 * サーバー側 reviewStore.ts と同じ reviewKey を使い、新store（XDG data dir 配下）
 * のレビューデータ格納ディレクトリを解決する。キー導出ロジックを重複させない
 * ため、実装は import した reviewKey にそのまま委譲する。
 */
export function reviewDirFor(nymphDataHome: string, file: string): string {
  return join(nymphDataHome, 'nymph', 'reviews', reviewKey(file));
}

export function reviewCommentsPathFor(
  nymphDataHome: string,
  file: string,
): string {
  return join(reviewDirFor(nymphDataHome, file), 'comments.json');
}

export function reviewCheckpointPathFor(
  nymphDataHome: string,
  file: string,
): string {
  return join(reviewDirFor(nymphDataHome, file), 'checkpoint');
}

const ASSETS_DIR = join(process.cwd(), 'tests/e2e/assets');
const HLJS_STYLES_DIR = join(process.cwd(), 'node_modules/highlight.js/styles');

/**
 * 外部 CDN 資産（Google Fonts / hljs CSS）をリポジトリ内のベンダリング済み
 * コピーで返し、その他の外部ホストへのリクエストは遮断する。
 *
 * これにより E2E は常に本番と同じ Web フォントがロードされた状態で動作する
 * （ネットワーク状況次第でフォールバックフォントのまま走る、という
 * 本番非再現な状態を排除する）。想定外の外部リクエストは abort されるため、
 * 新たな外部依存が入り込むとテストが明確に失敗して顕在化する。
 */
async function routeStaticAssets(ctx: BrowserContext): Promise<void> {
  // 後に登録した route が優先されるため、遮断のキャッチオールを最初に登録する
  await ctx.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) =>
    route.abort(),
  );
  await ctx.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({
      path: join(ASSETS_DIR, 'google-fonts.css'),
      contentType: 'text/css',
    }),
  );
  await ctx.route('https://fonts.gstatic.com/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({
      path: join(ASSETS_DIR, 'fonts', name),
      contentType: 'font/woff2',
    });
  });
  // hljs テーマ CSS は lockfile 固定の node_modules コピーで返す
  await ctx.route('https://cdn.jsdelivr.net/npm/highlight.js@*/**', (route) => {
    const file = new URL(route.request().url()).pathname.split('/styles/')[1];
    return route.fulfill({
      path: join(HLJS_STYLES_DIR, file),
      contentType: 'text/css',
    });
  });
}

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
  /** レガシーサイドカー（`fixturePath + '.comments.json'`）。移行テスト専用。 */
  commentsPath: string;
  /** レガシーサイドカー（`fixturePath + '.checkpoint'`）。移行テスト専用。 */
  legacyCheckpointPath: string;
  /** 新store（XDG data dir 配下）でのこのワーカーの fixturePath 用格納ディレクトリ */
  reviewDir: string;
  /** 新store側の comments.json（`reviewDir + '/comments.json'`） */
  reviewCommentsPath: string;
  /** 新store側の checkpoint（`reviewDir + '/checkpoint'`） */
  reviewCheckpointPath: string;
  dictDir: string;
  dictPath: string;
  /** サーバープロセスが使う XDG_CONFIG_HOME（承認済みハッシュの保存先） */
  nymphConfigDir: string;
};

export async function pollUntilReady(
  url: string,
  timeoutMs = 20000,
): Promise<void> {
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
            XDG_DATA_HOME: nymphConfigDir,
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
        `${fixturePath}.checkpoint`,
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

  // Override built-in context to set per-worker baseURL + deterministic assets
  context: async ({ browser, _workerServer }, use) => {
    const ctx = await browser.newContext({
      baseURL: `http://localhost:${_workerServer.port}`,
    });
    await routeStaticAssets(ctx);
    await use(ctx);
    await ctx.close();
  },

  fixturePath: async ({ _workerServer }, use) => {
    await use(_workerServer.fixturePath);
  },

  commentsPath: async ({ _workerServer }, use) => {
    await use(`${_workerServer.fixturePath}.comments.json`);
  },

  legacyCheckpointPath: async ({ _workerServer }, use) => {
    await use(`${_workerServer.fixturePath}.checkpoint`);
  },

  reviewDir: async ({ _workerServer }, use) => {
    await use(
      reviewDirFor(_workerServer.nymphConfigDir, _workerServer.fixturePath),
    );
  },

  reviewCommentsPath: async ({ reviewDir }, use) => {
    await use(join(reviewDir, 'comments.json'));
  },

  reviewCheckpointPath: async ({ reviewDir }, use) => {
    await use(join(reviewDir, 'checkpoint'));
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
