/**
 * Stage B: ツールバー再編で新設した設定ポップオーバー（⚙）の開閉と、
 * そこへ移動したテーマ切替・本文フォント・本文幅の一括操作を検証する。
 */
import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.describe('⚙ 設定ポップオーバー', () => {
  test('初期状態では閉じており、⚙ボタンで開く', async ({ page }) => {
    await expect(page.getByTestId('settings-menu')).not.toBeVisible();
    await page.getByTestId('settings-menu-btn').click();
    await expect(page.getByTestId('settings-menu')).toBeVisible();
  });

  test('移動した項目（テーマ切替・本文フォント・本文幅）が見える', async ({
    page,
  }) => {
    await page.getByTestId('settings-menu-btn').click();
    const menu = page.getByTestId('settings-menu');
    await expect(menu.locator('#btn-theme')).toBeVisible();
    await expect(menu.getByTestId('content-font-select')).toBeVisible();
    await expect(menu.getByTestId('margin-toggle-left')).toBeVisible();
    await expect(menu.getByTestId('margin-toggle-right')).toBeVisible();
  });

  test('外側クリックで閉じる', async ({ page }) => {
    await page.getByTestId('settings-menu-btn').click();
    await expect(page.getByTestId('settings-menu')).toBeVisible();
    await page.locator('#content').click();
    await expect(page.getByTestId('settings-menu')).not.toBeVisible();
  });

  test('Escape キーで閉じる', async ({ page }) => {
    await page.getByTestId('settings-menu-btn').click();
    await expect(page.getByTestId('settings-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-menu')).not.toBeVisible();
  });

  test('1回開いたままテーマ・本文フォント・本文幅をまとめて変更できる', async ({
    page,
  }) => {
    const initialTheme = await page.evaluate(
      () => document.documentElement.dataset.theme ?? 'dark',
    );

    await page.getByTestId('settings-menu-btn').click();

    // テーマ切替
    await page.locator('#btn-theme').click();
    const afterTheme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(afterTheme).not.toBe(initialTheme);
    expect(await page.evaluate(() => localStorage.getItem('nymph-theme'))).toBe(
      afterTheme,
    );

    // 本文フォント（メニューは開いたまま操作できる）
    await expect(page.getByTestId('settings-menu')).toBeVisible();
    await page.selectOption('#content-font-select', 'default');
    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--content-font',
      ),
    );
    expect(fontFamily).toContain('Lora');
    expect(
      await page.evaluate(() => localStorage.getItem('nymph-content-font')),
    ).toBe('default');

    // 本文幅（左マージン折りたたみ）
    const before = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    await page.getByTestId('margin-toggle-left').click();
    const after = await page
      .locator('#content')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before);
    expect(
      await page.evaluate(() =>
        localStorage.getItem('nymph-margin-left-collapsed'),
      ),
    ).toBe('1');

    // 一連の操作の間、メニュー項目クリックでは閉じない
    await expect(page.getByTestId('settings-menu')).toBeVisible();
  });
});
