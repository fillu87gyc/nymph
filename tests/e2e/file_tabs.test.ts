/**
 * Stage B: FileTabs の自動非表示（mo 方式）。
 * 開いているファイルが1つ以下のときはタブ行自体を描画せず、2つ以上で
 * 自動的に現れる。
 */
import { closeSecondFile, expect, openSecondFile, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.describe('FileTabs の自動表示/非表示', () => {
  test('ファイルが1件のときはタブ行が表示されない', async ({ page }) => {
    await expect(page.locator('#file-tabs')).not.toBeVisible();
  });

  test('2ファイル目を開くとタブ行が現れ、両方のタブが見える', async ({
    page,
    fixturePath,
  }) => {
    await expect(page.locator('#file-tabs')).not.toBeVisible();

    const second = await openSecondFile(page, fixturePath);
    try {
      await expect(page.locator('#file-tabs')).toBeVisible();
      await expect(
        page.locator('#file-tabs button', { hasText: second.name }),
      ).toBeVisible();
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('タブの×ボタンで閉じると1ファイルに戻りタブ行が再び非表示になる', async ({
    page,
    fixturePath,
  }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      const secondTab = page.locator('#file-tabs button', {
        hasText: second.name,
      });
      await expect(secondTab).toBeVisible();

      // タブの × アイコン（span）をクリックして閉じる
      await secondTab.locator('span').click();
      await expect(secondTab).toHaveCount(0, { timeout: 3000 });

      // 1ファイルに戻ったのでタブ行自体が非表示になる
      await expect(page.locator('#file-tabs')).not.toBeVisible();
    } finally {
      await closeSecondFile(page, second.path);
    }
  });

  test('タブをクリックして切り替えられる', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      // 2ファイル目が開かれた直後はそちらがアクティブ
      await expect(page.locator('#content h1')).toContainText('Second');

      const firstTabName = fixturePath.split('/').pop() ?? '';
      await page
        .locator('#file-tabs button', { hasText: firstTabName })
        .click();
      await expect(page.locator('#content h1')).toContainText('Sample');
    } finally {
      await closeSecondFile(page, second.path);
    }
  });
});
