/**
 * テーマ / hljs portal 回帰テスト
 *
 * applyHljsTheme() → document.createElement('link') を廃止し、
 * createPortal(<link>, document.head) に置き換えた。
 * portal が機能しないと <head> に link タグが現れず、hljs スタイルが
 * 一切当たらない（シンタックスハイライトが崩れる）。
 */
import { expect, openSettingsMenu, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.describe('hljs テーマ link portal', () => {
  test('head に highlight.js CDN の link タグが存在する', async ({ page }) => {
    const href = await page.evaluate(() => {
      const link = document.head.querySelector(
        'link[rel="stylesheet"][href*="highlight.js"]',
      );
      return link?.getAttribute('href') ?? null;
    });
    expect(href).not.toBeNull();
    expect(href).toContain('highlight.js');
  });

  test('初期テーマが dark の場合は dark 用テーマの URL が設定される', async ({
    page,
  }) => {
    // localStorage がなければ dark がデフォルト
    await page.evaluate(() => localStorage.removeItem('nymph-theme'));
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    const href = await page.evaluate(() =>
      document.head
        .querySelector('link[href*="highlight.js"]')
        ?.getAttribute('href'),
    );
    expect(href).toContain('dark');
  });

  test('テーマ切替で link href が変わる', async ({ page }) => {
    const before = await page.evaluate(() =>
      document.head
        .querySelector('link[href*="highlight.js"]')
        ?.getAttribute('href'),
    );

    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();

    // React state 更新 → portal 再レンダー
    await page.waitForFunction(
      (prev) => {
        const link = document.head.querySelector('link[href*="highlight.js"]');
        return link?.getAttribute('href') !== prev;
      },
      before,
      { timeout: 2000 },
    );

    const after = await page.evaluate(() =>
      document.head
        .querySelector('link[href*="highlight.js"]')
        ?.getAttribute('href'),
    );
    expect(after).not.toBe(before);
    expect(after).toContain('highlight.js');
  });

  test('テーマを2回切替すると元の href に戻る', async ({ page }) => {
    const original = await page.evaluate(() =>
      document.head
        .querySelector('link[href*="highlight.js"]')
        ?.getAttribute('href'),
    );

    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    await page.waitForFunction(
      (prev) =>
        document.head
          .querySelector('link[href*="highlight.js"]')
          ?.getAttribute('href') !== prev,
      original,
      { timeout: 2000 },
    );

    await page.locator('#btn-theme').click();
    await page.waitForFunction(
      (prev) =>
        document.head
          .querySelector('link[href*="highlight.js"]')
          ?.getAttribute('href') === prev,
      original,
      { timeout: 2000 },
    );

    const restored = await page.evaluate(() =>
      document.head
        .querySelector('link[href*="highlight.js"]')
        ?.getAttribute('href'),
    );
    expect(restored).toBe(original);
  });

  test('link タグは head 内に1つだけ存在する（重複なし）', async ({ page }) => {
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    await page.locator('#btn-theme').click();

    const count = await page.evaluate(
      () => document.head.querySelectorAll('link[href*="highlight.js"]').length,
    );
    expect(count).toBe(1);
  });
});

test.describe('テーマ状態の永続化', () => {
  test('切替後のテーマが localStorage に保存される', async ({ page }) => {
    const before = await page.evaluate(
      () => document.documentElement.dataset.theme ?? 'dark',
    );
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-theme'),
    );
    const after = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(saved).toBe(after);
    expect(saved).not.toBe(before);
  });

  test('リロード後にテーマが復元される', async ({ page }) => {
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    const restored = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(restored).toBe(theme);
  });
});
