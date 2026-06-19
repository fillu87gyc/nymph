/**
 * Mermaid 拡大モーダル回帰テスト
 *
 * 小さく表示される mermaid 図はクリックでモーダルが開き、
 * 原寸 SVG を大きく確認できる。
 */
import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('[data-testid="mermaid-area"]').first(),
  ).toBeVisible({
    timeout: 8000,
  });
});

test.describe('mermaid 拡大モーダルの開閉', () => {
  test('mermaid 図クリックでモーダルが開く', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();
    await expect(page.locator('#mermaid-zoom-area svg').first()).toBeVisible();
  });

  test('✕ ボタンでモーダルが閉じる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    await page.locator('#btn-close-mermaid-zoom').click();
    await expect(page.locator('#mermaid-zoom-modal')).not.toBeVisible();
  });

  test('背景クリックでモーダルが閉じる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    await page
      .locator('#mermaid-zoom-modal')
      .click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#mermaid-zoom-modal')).not.toBeVisible();
  });
});
