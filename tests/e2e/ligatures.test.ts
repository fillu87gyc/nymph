import { expect, openSettingsMenu, type Page, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる。
test.describe.configure({ mode: 'parallel' });

/**
 * 指定セレクタの要素に効いている font-variant-ligatures の計算値。
 * 合字設定は継承で伝播させているため、「設定した要素」ではなく
 * 「実際にテキストを描画している要素」で確かめる。
 */
function ligaturesOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`element not found: ${sel}`);
    return getComputedStyle(el).fontVariantLigatures;
  }, selector);
}

async function gotoContent(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  await gotoContent(page);
  await openSettingsMenu(page);
});

test.describe('リガチャ設定', () => {
  test('既定では有効で、本文にもコードブロックにも合字が効いている', async ({
    page,
  }) => {
    await expect(page.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await ligaturesOf(page, '#content p')).toBe('normal');
    expect(await ligaturesOf(page, '#content pre code')).toBe('normal');
  });

  test('オフにすると本文・コード・本文外の UI すべてで合字が切れる', async ({
    page,
  }) => {
    await page.getByTestId('ligature-toggle').click();

    await expect(page.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await ligaturesOf(page, '#content p')).toBe('none');
    expect(await ligaturesOf(page, '#content pre code')).toBe('none');
    // #content の外（ツールバー等）にも継承で届いていること
    expect(await ligaturesOf(page, 'body')).toBe('none');

    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-ligatures'),
    );
    expect(saved).toBe('off');
  });

  test('リロードしても無効のまま復元される', async ({ page }) => {
    await page.getByTestId('ligature-toggle').click();
    await page.reload();
    await gotoContent(page);

    // 設定を開く前＝再描画直後の時点で既に反映されていること
    expect(await ligaturesOf(page, '#content pre code')).toBe('none');

    await openSettingsMenu(page);
    await expect(page.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('もう一度押すと有効に戻り、その状態も保存される', async ({ page }) => {
    const toggle = page.getByTestId('ligature-toggle');
    await toggle.click();
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await ligaturesOf(page, '#content pre code')).toBe('normal');
    expect(
      await page.evaluate(() => localStorage.getItem('nymph-ligatures')),
    ).toBe('on');
  });

  test('本文フォントを切り替えても合字設定は維持される', async ({ page }) => {
    await page.getByTestId('ligature-toggle').click();
    await page.selectOption('#content-font-select', 'merriweather');

    expect(await ligaturesOf(page, '#content p')).toBe('none');
    await expect(page.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
