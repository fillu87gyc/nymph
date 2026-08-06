/**
 * 印刷 / PDF 出力（v0.4 #2）の E2E。
 *
 * 「⋯ → 印刷 / PDF」でブラウザの印刷ダイアログを開くところと、印刷用の
 * 表示（@media print）が紙で成立する形になっているかを検証する。
 * 印刷ダイアログ自体はヘッドレスでは開けないので、window.print の呼び出しを
 * 差し替えて確認し、体裁は page.emulateMedia({ media: 'print' }) で
 * 印刷時の実際の計算値を見る。
 *
 * 見ているのは 3 点:
 *   1. 紙に出るのは本文だけ（ツールバー・枠・パネル・操作ボタンが混ざらない）
 *   2. ダークテーマのままでも黒い文字で出る（背景色は印刷されないため）
 *   3. 画面用のスクロール容器が解けている（1 ページ目で切れない）
 *
 * 読み取り専用（fixturePath・reviewDir を書き換えない）テストのみのファイル。
 */
import { expect, test } from './fixtures.ts';

test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.describe('印刷 / PDF', () => {
  test('⋯ メニューの「印刷 / PDF」で印刷ダイアログを開き、メニューは閉じる', async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls: number }).__printCalls++;
      };
    });

    await page.getByTestId('overflow-menu-btn').click();
    await page.getByTestId('print-btn').click();

    expect(
      await page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      ),
    ).toBe(1);
    // 印刷ダイアログの背後にメニューが開いたまま残らない
    await expect(page.getByTestId('overflow-menu')).not.toBeVisible();
  });

  test('印刷時は画面の付属物が消え、本文だけが残る', async ({ page }) => {
    // 比較のため、画面では見えていることを先に確認する
    // （右枠は既定でアウトライン。閉じていると枠ごと出ないので開いておく）
    await page.locator('#btn-comments').click();
    await page.getByTestId('toc-toggle').click();
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#comments-panel')).toBeVisible();
    await expect(page.getByTestId('widget-slot-right')).toBeVisible();
    await expect(page.getByTestId('content-resizer-left')).toBeVisible();

    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('#toolbar')).not.toBeVisible();
    await expect(page.locator('#comments-panel')).not.toBeVisible();
    await expect(page.getByTestId('widget-slot-right')).not.toBeVisible();
    await expect(page.getByTestId('content-resizer-left')).not.toBeVisible();
    // 本文は残る
    await expect(page.locator('#content')).toBeVisible();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible();
    await expect(page.locator('#content table')).toBeVisible();
  });

  test('ダークテーマのままでも紙にはライト配色（黒い文字）で出る', async ({
    page,
  }) => {
    // 既定はダーク。画面では薄い文字色
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const screenColor = await page.evaluate(
      () => getComputedStyle(document.body).color,
    );
    expect(screenColor).toBe('rgb(192, 202, 245)');

    await page.emulateMedia({ media: 'print' });

    const printed = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        color: getComputedStyle(document.body).color,
        bg: getComputedStyle(document.body).backgroundColor,
        // テーマ属性そのものは触らない（印刷のために画面の状態を書き換えない）
        theme: root.getAttribute('data-theme'),
      };
    });
    expect(printed.color).toBe('rgb(31, 35, 40)');
    expect(printed.bg).toBe('rgb(255, 255, 255)');
    expect(printed.theme).toBe('dark');
  });

  test('印刷時はスクロール容器が解け、本文全体が紙に流れる', async ({
    page,
  }) => {
    // 本文が確実にビューポートより高くなる高さにする
    await page.setViewportSize({ width: 800, height: 300 });
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible();

    const screenHeights = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight,
      content: document.getElementById('content')?.scrollHeight ?? 0,
    }));
    // 画面ではページ自体はスクロールせず（html/body は overflow:hidden）、
    // 内側の列だけがスクロールする＝ページの高さは本文の高さに追随しない
    expect(screenHeights.content).toBeGreaterThan(300);
    expect(screenHeights.doc).toBeLessThan(screenHeights.content);

    await page.emulateMedia({ media: 'print' });

    const printHeights = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight,
      content: document.getElementById('content')?.scrollHeight ?? 0,
      htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
    }));
    expect(printHeights.htmlOverflow).toBe('visible');
    expect(printHeights.bodyOverflow).toBe('visible');
    // ページ全体が本文の高さぶんまで伸びている＝1 ページ目で切れない
    expect(printHeights.doc).toBeGreaterThanOrEqual(printHeights.content);
    expect(printHeights.doc).toBeGreaterThan(300);
  });

  test('差分チェックモードでも差分ビューだけが紙に残る', async ({ page }) => {
    await page.locator('#btn-diff').click();
    await expect(page.getByTestId('diff-view')).toBeVisible({ timeout: 3000 });

    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('#toolbar')).not.toBeVisible();
    await expect(page.getByTestId('diff-view')).toBeVisible();
  });
});
