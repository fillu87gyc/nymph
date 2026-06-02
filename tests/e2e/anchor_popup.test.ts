/**
 * コメントアンカークリック → ポップアップ表示の E2E テスト
 *
 * selection コメントが付いたテキストをクリックすると
 * #anchor-comment-popup が表示されるかを検証する。
 */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

async function addSelectionComment(
  page: import('@playwright/test').Page,
  text: string,
): Promise<void> {
  // 段落をトリプルクリックして選択 → selection popup → コメント追加
  await page
    .locator('#content [data-testid="md-block"] p')
    .first()
    .click({ clickCount: 3 });
  await expect(page.locator('#selection-popup')).toBeVisible({ timeout: 1000 });
  await page.locator('#btn-selection-comment').click();
  await expect(page.locator('#comment-modal')).toBeVisible();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({
    timeout: 3000,
  });
  // CSS Custom Highlight が設定されるまで待つ
  await page
    .waitForFunction(
      () => 'highlights' in CSS && CSS.highlights.has('comment-anchor'),
      { timeout: 2000 },
    )
    .catch(() => {
      /* サポートなしブラウザでは無視 */
    });
}

async function clickAnchoredParagraph(
  page: import('@playwright/test').Page,
): Promise<void> {
  const pRect = await page
    .locator('#content [data-testid="md-block"] p')
    .first()
    .boundingBox();
  if (!pRect) throw new Error('paragraph not found');
  // テキスト先頭寄りをクリック（アンカーレンジ内に確実に入るよう）
  await page.mouse.click(pRect.x + 60, pRect.y + pRect.height / 2);
}

test.beforeEach(async ({ page }) => {
  if (existsSync(COMMENTS_FILE)) rmSync(COMMENTS_FILE);
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"] p').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(() => {
  try {
    rmSync(COMMENTS_FILE);
  } catch {
    /* ignore */
  }
});

test.describe('コメントアンカークリック', () => {
  test('ハイライトテキストをクリックするとポップアップが開く', async ({
    page,
  }) => {
    await addSelectionComment(page, 'anchor popup test');

    // CSS Custom Highlight API が利用可能か確認（非対応ブラウザはスキップ）
    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await clickAnchoredParagraph(page);

    await expect(page.locator('#anchor-comment-popup')).toBeVisible({
      timeout: 1000,
    });
  });

  test('ポップアップにコメントテキストが表示される', async ({ page }) => {
    await addSelectionComment(page, 'popup text check');

    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await clickAnchoredParagraph(page);

    await expect(
      page.locator('#anchor-comment-popup [data-testid="acp-text"]'),
    ).toContainText('popup text check', { timeout: 1000 });
  });

  test('✕ ボタンでポップアップが閉じる', async ({ page }) => {
    await addSelectionComment(page, 'close popup test');

    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await clickAnchoredParagraph(page);
    await expect(page.locator('#anchor-comment-popup')).toBeVisible({
      timeout: 1000,
    });

    await page.locator('#anchor-comment-popup').getByText('✕').click();
    await expect(page.locator('#anchor-comment-popup')).not.toBeVisible({
      timeout: 500,
    });
  });

  test('ポップアップ外をクリックすると閉じる', async ({ page }) => {
    await addSelectionComment(page, 'click outside close');

    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await clickAnchoredParagraph(page);
    await expect(page.locator('#anchor-comment-popup')).toBeVisible({
      timeout: 1000,
    });

    // ポップアップ外（ツールバー）をクリック
    await page.locator('#toolbar').click();
    await expect(page.locator('#anchor-comment-popup')).not.toBeVisible({
      timeout: 500,
    });
  });

  test('編集ボタンでコメントモーダルが開く', async ({ page }) => {
    await addSelectionComment(page, 'edit from popup');

    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await clickAnchoredParagraph(page);
    await expect(page.locator('#anchor-comment-popup')).toBeVisible({
      timeout: 1000,
    });

    await page.locator('#anchor-comment-popup').getByText('✎ 編集').click();
    await expect(page.locator('#comment-modal')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('#btn-submit')).toContainText('更新');
  });

  test('ゴミ箱ボタンでコメントが削除される', async ({ page }) => {
    await addSelectionComment(page, 'delete from popup');

    const supported = await page.evaluate(() => 'highlights' in CSS);
    if (!supported) return;

    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await clickAnchoredParagraph(page);
    await expect(page.locator('#anchor-comment-popup')).toBeVisible({
      timeout: 1000,
    });

    await page.locator('#anchor-comment-popup [data-testid="acp-del"]').click();
    await expect(page.locator('#anchor-comment-popup')).not.toBeVisible({
      timeout: 500,
    });
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
  });
});
