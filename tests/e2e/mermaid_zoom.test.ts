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

test.describe('mermaid 拡大モーダルのサイズ', () => {
  test('デフォルトは拡大・縮小なし（scale(1)）で表示される', async ({
    page,
  }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    const transform = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });

  test('Ctrl+スクロールで拡大・縮小できる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    const area = page.locator('#mermaid-zoom-area');
    const box = await area.boundingBox();
    if (!box) throw new Error('area bounding box not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.keyboard.down('Control');
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
    }
    await page.keyboard.up('Control');

    const scaleAfterZoomIn = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(scaleAfterZoomIn).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect(scaleAfterZoomIn).not.toBe('none');

    // ctrl なしのスクロールは拡大に影響しない
    await page.mouse.wheel(0, -100);
    const scaleUnchanged = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(scaleUnchanged).toBe(scaleAfterZoomIn);
  });

  test('モーダルを再度開くとサイズがリセットされる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    const area = page.locator('#mermaid-zoom-area');
    const box = await area.boundingBox();
    if (!box) throw new Error('area bounding box not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');

    await page.locator('#btn-close-mermaid-zoom').click();
    await expect(page.locator('#mermaid-zoom-modal')).not.toBeVisible();

    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();
    const transform = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });
});
