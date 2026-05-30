/**
 * DrawioModal 回帰テスト
 *
 * download 処理を document.createElement('a') → useRef<HTMLAnchorElement> に
 * 変更した。ref が null の場合は download が静かに失敗する。
 * モーダルの開閉、コード表示、download トリガーをカバーする。
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // mermaid ブロックが存在することを確認
  await expect(page.locator('.mermaid-wrap').first()).toBeVisible({
    timeout: 8000,
  });
});

test.describe('draw.io モーダルの開閉', () => {
  test('「→ draw.io」ボタンクリックでモーダルが開く', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();
  });

  test('✕ ボタンでモーダルが閉じる', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    await page.locator('#btn-close-drawio').click();
    await expect(page.locator('#drawio-modal')).not.toBeVisible();
  });

  test('背景クリックでモーダルが閉じる', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    // モーダルの外側（オーバーレイ）をクリック
    await page.locator('#drawio-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#drawio-modal')).not.toBeVisible();
  });
});

test.describe('draw.io モーダルのコンテンツ', () => {
  test('mermaid コードがモーダル内に表示される', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#drawio-code')).toBeVisible();
    const code = await page.locator('#drawio-code').textContent();
    expect(code?.trim().length).toBeGreaterThan(0);
  });

  test('「コードをコピー」ボタンが存在する', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#btn-copy-mermaid')).toBeVisible();
  });

  test('「.drawio ダウンロード」ボタンが存在する', async ({ page }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#btn-dl-drawio')).toBeVisible();
  });
});

test.describe('download 用 hidden anchor の存在', () => {
  test('モーダル内に hidden な <a> が存在する（useRef download trigger）', async ({
    page,
  }) => {
    await page.locator('.btn-drawio').first().click();
    await expect(page.locator('#drawio-modal')).toBeVisible();

    // useRef で管理している download 用 <a> が DOM に存在する
    const exists = await page.evaluate(() => {
      const modal = document.querySelector('#drawio-modal');
      const anchor = modal?.querySelector('a[aria-hidden="true"]');
      return !!anchor;
    });
    expect(exists).toBe(true);
  });

  test('ダウンロードボタンクリックでトーストが表示される', async ({
    page,
    context,
  }) => {
    // download をインターセプトしてブラウザのダウンロード待ちを回避
    await context.route('blob:**', (route) => route.abort());

    await page.locator('.btn-drawio').first().click();
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
