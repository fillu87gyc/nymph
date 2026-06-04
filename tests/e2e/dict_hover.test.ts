import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const MOCK_DICT = {
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: [
    {
      term: 'Sample',
      aliases: [],
      definition: 'Sample とはテスト用語である。',
      definitionHtml: '<p>Sample とはテスト用語である。</p>',
      source: 'test',
      sourceRef: '',
    },
  ],
};

test.describe('dict: 用語ホバーツールチップ', () => {
  test.beforeAll(async ({ dictDir, dictPath }) => {
    mkdirSync(dictDir, { recursive: true });
    writeFileSync(dictPath, JSON.stringify(MOCK_DICT, null, 2));
  });

  test('GET /dict が entries を返す', async ({ page }) => {
    const res = await page.request.get('/dict');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].term).toBe('Sample');
  });

  test('用語 "Sample" が #content 内にハイライトされる', async ({ page }) => {
    await page.goto('/');
    // sample.md の先頭 "# Sample" の "Sample" がハイライトされること
    await expect(page.locator('[data-dict-term="Sample"]').first()).toBeVisible(
      { timeout: 5000 },
    );
  });

  test('用語ホバーで定義ツールチップが表示される', async ({ page }) => {
    await page.goto('/');
    const term = page.locator('[data-dict-term="Sample"]').first();
    await expect(term).toBeVisible({ timeout: 5000 });
    await term.hover();
    await expect(page.locator('[data-testid="dict-tooltip"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="dict-tooltip"]')).toContainText(
      'Sample',
    );
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: 'test-results/screenshots/dict-tooltip.png' });
  });

  test('辞書更新ボタンが存在する', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="dict-fetch-btn"]')).toBeVisible();
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: 'test-results/screenshots/dict-fetch-btn.png' });
  });
});
