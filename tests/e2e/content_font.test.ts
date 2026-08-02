import { CONTENT_FONT_OPTIONS } from '../../src/client/lib/fonts.ts';
import { expect, openSettingsMenu, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる
// （各テストは _workerServer 経由で独立したサーバー/ポートを持つため安全）。
test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
  // 本文フォント select は設定ポップオーバーの中に移動した
  await openSettingsMenu(page);
});

test.describe('本文フォント選択', () => {
  test('デフォルトでは Inter が #content の本文フォントとして適用される', async ({
    page,
  }) => {
    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--content-font',
      ),
    );
    expect(fontFamily).toContain('Inter');
  });

  test('フォントを切り替えると --content-font 変数が変わり localStorage に保存される', async ({
    page,
  }) => {
    await page.selectOption('#content-font-select', 'default');

    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--content-font',
      ),
    );
    expect(fontFamily).toContain('Lora');

    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-content-font'),
    );
    expect(saved).toBe('default');
  });

  test('リロード後も選択したフォントが復元される', async ({ page }) => {
    await page.selectOption('#content-font-select', 'merriweather');
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await openSettingsMenu(page);

    const selected = await page.locator('#content-font-select').inputValue();
    expect(selected).toBe('merriweather');

    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        '--content-font',
      ),
    );
    expect(fontFamily).toContain('Merriweather');
  });

  test('すべてのフォント選択肢が一覧に存在し、選択すると本文フォントに反映される', async ({
    page,
  }) => {
    for (const opt of CONTENT_FONT_OPTIONS) {
      await page.selectOption('#content-font-select', opt.id);

      const fontFamily = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          '--content-font',
        ),
      );
      expect(fontFamily).toBe(opt.bodyFont);
    }
  });
});
