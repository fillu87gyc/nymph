import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const DICT_DIR = join(process.cwd(), '.nymph');
const DICT_PATH = join(DICT_DIR, 'dict.json');
const NYMPH_YML_PATH = join(process.cwd(), 'nymph.yml');

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

test.describe('dict: POST /dict/sync', () => {
  test.beforeAll(() => {
    mkdirSync(DICT_DIR, { recursive: true });
    writeFileSync(DICT_PATH, JSON.stringify(STALE_DICT, null, 2));
    writeFileSync(NYMPH_YML_PATH, NYMPH_YML);
  });

  test.afterAll(() => {
    try {
      rmSync(NYMPH_YML_PATH);
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
