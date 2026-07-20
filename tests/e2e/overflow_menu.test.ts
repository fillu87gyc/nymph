/**
 * Stage B: ツールバー再編で新設した「⋯」オーバーフローメニューの
 * 開閉と、そこへ移動した項目からの操作実行を検証する。
 */
import { rmSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page, reviewDir }) => {
  // チェックポイント設定の項目実行テストがあるため、ワーカー内の他テストと
  // 分離できるよう毎回掃除してから開始する。
  rmSync(reviewDir, { recursive: true, force: true });
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(async ({ reviewDir }) => {
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('⋯ オーバーフローメニュー', () => {
  test('初期状態では閉じており、⋯ボタンで開く', async ({ page }) => {
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.getByTestId('overflow-menu')).toBeVisible();
  });

  test('移動した項目（フォルダを開く・パスをコピー・ブックマーク・チェックポイント設定・すべて削除）が見える', async ({
    page,
  }) => {
    await page.getByTestId('overflow-menu-btn').click();
    const menu = page.getByTestId('overflow-menu');
    await expect(menu.getByTestId('open-dir-btn')).toBeVisible();
    await expect(menu.locator('#btn-copy-path')).toBeVisible();
    await expect(menu.getByTestId('bookmark-toggle')).toBeVisible();
    await expect(menu.locator('#btn-checkpoint')).toBeVisible();
    await expect(menu.locator('#btn-clear-all')).toBeVisible();
  });

  test('もう一度⋯をクリックすると閉じる', async ({ page }) => {
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.getByTestId('overflow-menu')).toBeVisible();
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
  });

  test('外側クリックで閉じる', async ({ page }) => {
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.getByTestId('overflow-menu')).toBeVisible();
    await page.locator('#content').click();
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
  });

  test('Escape キーで閉じる', async ({ page }) => {
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.getByTestId('overflow-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
  });

  test('項目クリックでハンドラが実行されると同時にメニューが閉じる（すべて削除の確認モーダルの背後に残らない）', async ({
    page,
  }) => {
    // コメントが無い状態で「すべて削除」をクリックしてもモーダルは開かない
    // （既存挙動）ため、ここではブックマーク切替で「実行されると閉じる」ことを検証する
    await page.getByTestId('overflow-menu-btn').click();
    await page.getByTestId('bookmark-toggle').click();
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
    await expect(page.locator('#toast')).toContainText('ブックマーク', {
      timeout: 3000,
    });

    // 後片付け
    await page.getByTestId('overflow-menu-btn').click();
    await page.getByTestId('bookmark-toggle').click();
  });

  test('項目実行例: メニュー経由のチェックポイント設定 → 差分チェックモードに反映される', async ({
    page,
  }) => {
    await page.getByTestId('overflow-menu-btn').click();
    await page.locator('#btn-checkpoint').click();
    // 項目クリックでメニューは閉じるため、状態確認には開き直す
    await page.getByTestId('overflow-menu-btn').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );

    // 続けて差分チェックへ切り替えると「チェックポイント未設定」の案内は
    // 出ず、通常の差分表示になる
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="diff-empty"]')).toHaveCount(0);
  });
});
