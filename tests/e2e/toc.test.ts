import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('目次パネル', () => {
  test('トグルボタンで目次パネルが開閉する', async ({ page }) => {
    await expect(page.locator('[data-testid="toc-panel"]')).not.toBeVisible();
    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(page.locator('[data-testid="toc-panel"]')).toBeVisible();
    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(page.locator('[data-testid="toc-panel"]')).not.toBeVisible();
  });

  test('sample.md の見出しが抽出されて表示される', async ({ page }) => {
    await page.locator('[data-testid="toc-toggle"]').click();
    const items = page.locator('[data-testid="toc-item"]');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('Sample');
    await expect(items.nth(1)).toHaveText('Section');
    await expect(items.nth(2)).toHaveText('Diagram');
  });

  test('見出しクリックで対応セクションまでスクロールしてハイライトする', async ({
    page,
  }) => {
    await page.locator('[data-testid="toc-toggle"]').click();

    const diagramHeading = page
      .locator('#content [data-testid="md-block"][data-block-type="heading"]')
      .filter({ hasText: 'Diagram' });
    const lineStart = await diagramHeading.getAttribute('data-line-start');

    await page.locator('[data-testid="toc-item"]').nth(2).click();

    await expect(diagramHeading).toBeInViewport({ timeout: 3000 });
    await expect(
      page.locator(`#content [data-block][data-line-start="${lineStart}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });
  });

  test('差分チェックモードでは目次ボタンが無効化される', async ({ page }) => {
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="toc-toggle"]')).toBeDisabled();
  });
});
