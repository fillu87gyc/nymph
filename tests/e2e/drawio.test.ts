/**
 * DrawioModal 回帰テスト
 *
 * download 処理は document.createElement('a') で一時リンクを生成し
 * click → revokeObjectURL する方式（隠し <a> を DOM に残さない）。
 * モーダルの開閉、コード表示、download トリガーをカバーする。
 */
import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // mermaid ブロックが存在することを確認
  await expect(
    page.locator('[data-testid="mermaid-wrap"]').first(),
  ).toBeVisible({
    timeout: 8000,
  });
});

test.describe('draw.io モーダルの開閉', () => {
  test('「→ draw.io」ボタンクリックでモーダルが開く', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();
  });

  test('✕ ボタンでモーダルが閉じる', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    await page.locator('#btn-close-drawio').click();
    await expect(page.locator('#drawio-modal')).not.toBeVisible();
  });

  test('背景クリックでモーダルが閉じる', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    // モーダルの外側（オーバーレイ）をクリック
    await page.locator('#drawio-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#drawio-modal')).not.toBeVisible();
  });
});

test.describe('draw.io モーダルのコンテンツ', () => {
  test('mermaid コードがモーダル内に表示される', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#drawio-code')).toBeVisible();
    const code = await page.locator('#drawio-code').textContent();
    expect(code?.trim().length).toBeGreaterThan(0);
  });

  test('「コードをコピー」ボタンが存在する', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#btn-copy-mermaid')).toBeVisible();
  });

  test('「.drawio ダウンロード」ボタンが存在する', async ({ page }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#btn-dl-drawio')).toBeVisible();
  });
});

test.describe('download トリガー', () => {
  test('モーダル内に永続的な hidden <a> を残さない（動的生成方式）', async ({
    page,
  }) => {
    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    // download は一時アンカーを動的生成するため、固定の hidden <a> は存在しない
    const exists = await page.evaluate(() => {
      const modal = document.querySelector('#drawio-modal');
      return !!modal?.querySelector('a[tabindex="-1"]');
    });
    expect(exists).toBe(false);
  });

  test('ダウンロードボタンクリックでトーストが表示される', async ({
    page,
    context,
  }) => {
    // download をインターセプトしてブラウザのダウンロード待ちを回避
    await context.route('blob:**', (route) => route.abort());

    await page.locator('[data-testid="btn-drawio"]').first().click();
    await expect(page.locator('#btn-dl-drawio')).toBeVisible();

    // ダウンロードイベントを待つ（失敗しても構わない）
    const downloadPromise = page
      .waitForEvent('download', { timeout: 3000 })
      .catch(() => null);
    await page.locator('#btn-dl-drawio').click();
    await downloadPromise;

    // トーストで完了メッセージが出ることを確認
    await expect(page.locator('#toast')).toContainText('.drawio', {
      timeout: 3000,
    });
  });
});
