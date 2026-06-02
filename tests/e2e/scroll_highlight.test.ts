/**
 * blockRefsMap によるスクロール＋ハイライト回帰テスト
 *
 * scrollToComment は querySelector を廃止し、React の ref Map でブロック要素を
 * 特定するようになった。この Map への登録が壊れると、コメントクリックが完全に
 * 機能しなくなる。各テストはその回帰を検出する。
 */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

async function addCommentToBlock(
  page: import('@playwright/test').Page,
  selector: string,
  text: string,
) {
  const block = page.locator(selector).first();
  await block.hover();
  await block.locator('[data-testid="comment-btn"]').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({
    timeout: 3000,
  });
}

test.beforeEach(async ({ page }) => {
  if (existsSync(COMMENTS_FILE)) rmSync(COMMENTS_FILE);
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
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

test.describe('blockRefsMap 経由のスクロール', () => {
  test('コメントクリックで対応ブロックがビューポートに入る', async ({
    page,
  }) => {
    // mermaid ブロック（下のほうにある）にコメントを付ける
    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('mermaid block comment');
    await page.locator('#btn-submit').click();
    await expect(
      page.locator('[data-testid="comment-item"]').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    // ページを一番上にスクロール
    await page.evaluate(() => window.scrollTo(0, 0));

    // コメントクリック → mermaid ブロックまでスクロールされる
    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(mermaidBlock).toBeInViewport({ timeout: 3000 });
  });

  test('複数ブロックにコメントして別々にスクロールできる', async ({ page }) => {
    const tableSelector =
      '#content [data-testid="md-block"][data-block-type="table"]';
    const mermaidSelector =
      '#content [data-testid="md-block"][data-block-type="mermaid"]';

    await addCommentToBlock(page, tableSelector, 'table block');
    await addCommentToBlock(page, mermaidSelector, 'mermaid block');

    const items = page.locator('[data-testid="comment-item"]');
    await expect(items).toHaveCount(2);

    // 2番目のコメントクリック → mermaid ブロックに移動
    const mermaidBlock = page.locator(mermaidSelector).first();
    const mermaidLs = await mermaidBlock.getAttribute('data-ls');

    await items.nth(1).click();
    await expect(
      page.locator(`#content [data-testid="md-block"][data-ls="${mermaidLs}"]`),
    ).toBeInViewport({ timeout: 2000 });
  });
});

test.describe('ハイライト状態', () => {
  test('コメントクリックでブロックがハイライトされる', async ({ page }) => {
    await addCommentToBlock(
      page,
      '#content [data-testid="md-block"][data-block-type="table"]',
      'highlight check',
    );

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const ls = await tableBlock.getAttribute('data-ls');

    await page.locator('[data-testid="comment-item"]').first().click();

    await expect(
      page.locator(`#content [data-block][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });
  });

  test('ハイライトは 1.4s アニメーション後に解除される', async ({ page }) => {
    await addCommentToBlock(
      page,
      '#content [data-testid="md-block"][data-block-type="table"]',
      'fade check',
    );

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const ls = await tableBlock.getAttribute('data-ls');

    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator(`#content [data-block][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });

    await expect(
      page.locator(`#content [data-block][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'false', { timeout: 2500 });
  });

  test('data-block 属性がすべてのブロックに付いている', async ({ page }) => {
    const blocks = page.locator('#content [data-block]');
    const count = await blocks.count();
    expect(count).toBeGreaterThan(0);

    // data-ls / data-le も存在する
    for (let i = 0; i < Math.min(count, 5); i++) {
      const ls = await blocks.nth(i).getAttribute('data-ls');
      const le = await blocks.nth(i).getAttribute('data-le');
      expect(ls).not.toBeNull();
      expect(le).not.toBeNull();
      expect(Number(ls)).toBeGreaterThan(0);
      expect(Number(le)).toBeGreaterThanOrEqual(Number(ls));
    }
  });

  test('同時に複数ブロックがハイライトされない', async ({ page }) => {
    await addCommentToBlock(
      page,
      '#content [data-testid="md-block"][data-block-type="table"]',
      'a',
    );
    await addCommentToBlock(
      page,
      '#content [data-testid="md-block"][data-block-type="mermaid"]',
      'b',
    );

    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator('#content [data-highlighted="true"]'),
    ).toHaveCount(1, {
      timeout: 1000,
    });
  });
});
