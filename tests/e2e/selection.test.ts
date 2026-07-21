/**
 * SelectionPopup 回帰テスト
 *
 * Props が contentId: string → contentRef: RefObject に変わった。
 * contentRef が正しく渡されていないと、コンテンツ外の選択でも popup が
 * 出たり、逆にコンテンツ内で出なくなる。
 */
import { existsSync, rmSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

test.beforeEach(async ({ page, commentsPath, reviewDir }) => {
  if (existsSync(commentsPath)) rmSync(commentsPath);
  rmSync(reviewDir, { recursive: true, force: true });
  await page.goto('/');
  // #welcome の p ではなく、実際のコンテンツブロック内 p を待つ
  await expect(
    page.locator('#content [data-testid="md-block"] p').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(async ({ commentsPath, reviewDir }) => {
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('コンテンツ内テキスト選択 → popup 表示', () => {
  test('段落をトリプルクリックすると popup が現れる', async ({ page }) => {
    // md-block 内の <p> をトリプルクリックして全選択
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });
  });

  test('popup の「＋ コメント」ボタンクリックでコメントモーダルが開く', async ({
    page,
  }) => {
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });
    await page.locator('#btn-selection-comment').click();
    await expect(page.locator('#comment-modal')).toBeVisible();
  });

  test('選択テキストがモーダルのコンテキスト欄に表示される', async ({
    page,
  }) => {
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });
    await page.locator('#btn-selection-comment').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    // #modal-ctx にコンテキスト文字列が入っている
    const ctx = await page.locator('#modal-ctx').textContent();
    expect(ctx?.trim().length).toBeGreaterThan(0);
  });

  test('選択を解除すると popup が消える', async ({ page }) => {
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });

    // シングルクリックで選択を解除
    await page.locator('#content [data-testid="md-block"] p').first().click();
    await expect(page.locator('#selection-popup')).not.toBeVisible({
      timeout: 1000,
    });
  });
});

test.describe('コンテンツ外の選択では popup が出ない', () => {
  test('ツールバーテキストを選択しても popup が現れない', async ({ page }) => {
    // ツールバー要素を JS で選択して mouseup を発火
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="brand"]');
      if (!el) return;
      const range = document.createRange();
      range.selectNode(el);
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.evaluate(() =>
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })),
    );
    // SelectionPopup の setTimeout(show, 30) を待つ
    await page.waitForTimeout(150);
    await expect(page.locator('#selection-popup')).not.toBeVisible();
  });
});

test.describe('選択コメントのワークフロー', () => {
  test('テキスト選択 → コメント追加 → パネルにコンテキストが表示される', async ({
    page,
  }) => {
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });
    await page.locator('#btn-selection-comment').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    await page.locator('#comment-ta').fill('selection e2e comment');
    await page.locator('#btn-submit').click();

    await expect(page.locator('[data-testid="comment-item"]')).toBeVisible({
      timeout: 3000,
    });
    // コメントパネルのコンテキスト欄（c-ctx）に内容が表示される
    const ctx = await page
      .locator('[data-testid="comment-item"] [data-testid="c-ctx"]')
      .first()
      .textContent();
    expect(ctx?.trim().length).toBeGreaterThan(0);
  });

  test('選択コメントの block_type は selection になる', async ({ page }) => {
    await page
      .locator('#content [data-testid="md-block"] p')
      .first()
      .click({ clickCount: 3 });
    await expect(page.locator('#selection-popup')).toBeVisible({
      timeout: 1000,
    });
    await page.locator('#btn-selection-comment').click();
    await page.locator('#comment-ta').fill('block_type check');
    await page.locator('#btn-submit').click();
    await expect(page.locator('[data-testid="comment-item"]')).toBeVisible({
      timeout: 3000,
    });

    // サーバー側 JSON に block_type: 'selection' が保存されているか確認
    // GET /comments は { round, comments } 形式を返す（src/server.ts）
    const saved = await page.evaluate(async () => {
      const res = await fetch('/comments');
      return res.json();
    });
    expect(saved.comments[0]?.block_type).toBe('selection');
  });
});
