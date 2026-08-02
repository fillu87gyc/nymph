/**
 * Mermaid 拡大モーダル回帰テスト
 *
 * 小さく表示される mermaid 図はクリックでモーダルが開き、
 * 原寸 SVG を大きく確認できる。
 */
import { expect, test } from './fixtures.ts';

// 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル
// なので、1 ワーカーに固定せず全テストを worker プール全体に分散させる
// （各テストは _workerServer 経由で独立したサーバー/ポートを持つため安全）。
test.describe.configure({ mode: 'parallel' });

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

  test('Escape キーでモーダルが閉じる', async ({ page }) => {
    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    await page.keyboard.press('Escape');
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

    // wheel イベント → React の state 反映は非同期なので、一発読みせず
    // 拡大が反映されるまで待つ（タイミング依存のフレーク防止）
    await expect
      .poll(() =>
        page
          .locator('#mermaid-zoom-scale')
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .toMatch(/^matrix\((?!1, 0, 0, 1, 0, 0\))/);

    const scaleAfterZoomIn = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);

    // ctrl なしのスクロールは拡大に影響しない
    await page.mouse.wheel(0, -100);
    const scaleUnchanged = await page
      .locator('#mermaid-zoom-scale')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(scaleUnchanged).toBe(scaleAfterZoomIn);
  });

  test('大きい viewBox の図は縮小コンテナに収まらず実寸で表示される', async ({
    page,
  }) => {
    // mermaid は SVG に width="100%" を付与するため、モーダルの shrink-to-fit
    // コンテナ（display: inline-block）内では幅が解決できず、ブラウザの
    // 既定サイズ（300x150 相当）に縮小されてしまう回帰がかつてあった。
    // viewBox を大きい値に差し替えて、モーダル内 SVG が viewBox 由来の
    // 実寸（縦横比含む）で表示されることを確認する。
    await page
      .locator('[data-testid="mermaid-area"] svg')
      .first()
      .evaluate((svg) => svg.setAttribute('viewBox', '0 0 4000 800'));

    await page.locator('[data-testid="mermaid-area"]').first().click();
    await expect(page.locator('#mermaid-zoom-modal')).toBeVisible();

    const rect = await page
      .locator('#mermaid-zoom-area svg')
      .first()
      .evaluate((el) => el.getBoundingClientRect());
    expect(rect.width).toBeGreaterThan(1000);
    expect(rect.height / rect.width).toBeCloseTo(800 / 4000, 1);
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
    // リセットは React の state 反映を挟むため、一発読みせず待つ
    await expect
      .poll(() =>
        page
          .locator('#mermaid-zoom-scale')
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });
});
