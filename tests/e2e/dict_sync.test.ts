import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const STALE_DICT = {
  version: 1,
  updatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
  entries: [
    {
      term: 'Stale',
      aliases: [],
      definition: 'Old entry.',
      definitionHtml: '<p>Old entry.</p>',
      source: 'test',
      sourceRef: '',
    },
  ],
};

const NYMPH_YML = `sources:
  - name: glossary
    fetch:
      cmd: ["cat", "tests/fixtures/dict/glossary.md"]
    adapter: markdown
    rules:
      term: "h2:contains('ユビキタス言語') > h3"
      definition: "term > p"
dict:
  out: ".nymph/dict.json"
`;

// NYMPH_YML と source name が異なるため別ハッシュになる（承認されていない）
const UNAPPROVED_NYMPH_YML = `sources:
  - name: unapproved-source
    fetch:
      cmd: ["cat", "tests/fixtures/dict/glossary.md"]
    adapter: markdown
    rules:
      term: "h2:contains('ユビキタス言語') > h3"
      definition: "term > p"
dict:
  out: ".nymph/dict.json"
`;

test.describe('dict: POST /dict/sync', () => {
  let nymphYmlPath: string;

  test.beforeAll(async ({ dictDir, dictPath, nymphConfigDir }) => {
    mkdirSync(dictDir, { recursive: true });
    writeFileSync(dictPath, JSON.stringify(STALE_DICT, null, 2));
    nymphYmlPath = join(process.cwd(), '.nymph/config.yml');
    mkdirSync(join(process.cwd(), '.nymph'), { recursive: true });
    writeFileSync(nymphYmlPath, NYMPH_YML);

    // サーバープロセスの XDG_CONFIG_HOME にコマンドを事前承認しておく
    const origXDG = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = nymphConfigDir;
    try {
      const { parseConfig } = await import('../../src/dict/config.ts');
      const { computeCommandsHash, saveAcceptedHash } = await import(
        '../../src/dict/consent.ts'
      );
      saveAcceptedHash(computeCommandsHash(parseConfig(NYMPH_YML)));
    } finally {
      if (origXDG !== undefined) process.env.XDG_CONFIG_HOME = origXDG;
      else delete process.env.XDG_CONFIG_HOME;
    }
  });

  test.afterAll(() => {
    try {
      rmSync(nymphYmlPath);
    } catch {
      /* ignore */
    }
  });

  test('POST /dict/sync が 200 を返す', async ({ page }) => {
    const res = await page.request.post('/dict/sync');
    expect(res.ok()).toBe(true);
  });

  test('sync 後 GET /dict が更新された entries を含む', async ({ page }) => {
    await page.request.post('/dict/sync');
    const res = await page.request.get('/dict');
    const body = await res.json();
    const terms = body.entries.map((e: { term: string }) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('辞書更新ボタンクリックで /dict/sync が呼ばれる', async ({ page }) => {
    await page.goto('/');
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/dict/sync') && r.request().method() === 'POST',
        { timeout: 10000 },
      ),
      page.locator('[data-testid="dict-fetch-btn"]').click(),
    ]);
    expect(response.ok()).toBe(true);
  });
});

test.describe('dict: POST /dict/sync — 未承認コマンド', () => {
  let nymphYmlPath: string;

  test.beforeAll(async () => {
    nymphYmlPath = join(process.cwd(), '.nymph/config.yml');
    mkdirSync(join(process.cwd(), '.nymph'), { recursive: true });
    writeFileSync(nymphYmlPath, UNAPPROVED_NYMPH_YML);
    // nymphConfigDir には UNAPPROVED_NYMPH_YML のハッシュを保存しない
  });

  test.afterAll(() => {
    try {
      rmSync(nymphYmlPath);
    } catch {
      /* ignore */
    }
  });

  test('未承認コマンドで POST /dict/sync は 403 を返す', async ({ page }) => {
    const res = await page.request.post('/dict/sync');
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('nymph dict allow');
  });
});
