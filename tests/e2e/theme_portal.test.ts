/**
 * テーマ / hljs portal 回帰テスト
 *
 * applyHljsTheme() → document.createElement('link') を廃止し、
 * createPortal(<link>, document.head) に置き換えた。
 * portal が機能しないと <head> に link タグが現れず、hljs スタイルが
 * 一切当たらない（シンタックスハイライトが崩れる）。
 *
 * hljs テーマ CSS は Vite で bundle 済みのため、link href は
 * `/assets/tokyo-night-dark.min-<hash>.css` または
 * `/assets/github.min-<hash>.css` の形（CDN URL ではない）。
 */
import { expect, openSettingsMenu, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる
// （各テストは _workerServer 経由で独立したサーバー/ポートを持つため安全）。
test.describe.configure({ mode: 'parallel' });

// bundle 後の hljs テーマ CSS を href 文字列で判別するセレクタ。
// dark = tokyo-night-dark.min, light = github.min。
const HLJS_LINK_SELECTOR =
  'link[href*="tokyo-night-dark.min"], link[href*="github.min"]';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.describe('hljs テーマ link portal', () => {
  test('head に hljs テーマの link タグが存在する', async ({ page }) => {
    const href = await page.evaluate((sel) => {
      const link = document.head.querySelector(sel);
      return link?.getAttribute('href') ?? null;
    }, HLJS_LINK_SELECTOR);
    expect(href).not.toBeNull();
    // bundle 済み CSS の href は /assets/ 配下
    expect(href).toMatch(/\/assets\/(tokyo-night-dark|github)\.min/);
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

    const href = await page.evaluate((sel) => {
      return document.head.querySelector(sel)?.getAttribute('href');
    }, HLJS_LINK_SELECTOR);
    // dark テーマは tokyo-night-dark
    expect(href).toContain('tokyo-night-dark');
  });

  test('テーマ切替で link href が変わる', async ({ page }) => {
    const before = await page.evaluate((sel) => {
      return document.head.querySelector(sel)?.getAttribute('href');
    }, HLJS_LINK_SELECTOR);

    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();

    // React state 更新 → portal 再レンダー
    await page.waitForFunction(
      ({ sel, prev }) => {
        const link = document.head.querySelector(sel);
        return link?.getAttribute('href') !== prev;
      },
      { sel: HLJS_LINK_SELECTOR, prev: before },
      { timeout: 2000 },
    );

    const after = await page.evaluate((sel) => {
      return document.head.querySelector(sel)?.getAttribute('href');
    }, HLJS_LINK_SELECTOR);
    expect(after).not.toBe(before);
    // 切替後も bundle 済み CSS のいずれか
    expect(after).toMatch(/\/assets\/(tokyo-night-dark|github)\.min/);
  });

  test('テーマを2回切替すると元の href に戻る', async ({ page }) => {
    const original = await page.evaluate((sel) => {
      return document.head.querySelector(sel)?.getAttribute('href');
    }, HLJS_LINK_SELECTOR);

    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    await page.waitForFunction(
      ({ sel, prev }) =>
        document.head.querySelector(sel)?.getAttribute('href') !== prev,
      { sel: HLJS_LINK_SELECTOR, prev: original },
      { timeout: 2000 },
    );

    await page.locator('#btn-theme').click();
    await page.waitForFunction(
      ({ sel, prev }) =>
        document.head.querySelector(sel)?.getAttribute('href') === prev,
      { sel: HLJS_LINK_SELECTOR, prev: original },
      { timeout: 2000 },
    );

    const restored = await page.evaluate((sel) => {
      return document.head.querySelector(sel)?.getAttribute('href');
    }, HLJS_LINK_SELECTOR);
    expect(restored).toBe(original);
  });

  test('link タグは head 内に1つだけ存在する（重複なし）', async ({ page }) => {
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    await page.locator('#btn-theme').click();

    const count = await page.evaluate((sel) => {
      return document.head.querySelectorAll(sel).length;
    }, HLJS_LINK_SELECTOR);
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
