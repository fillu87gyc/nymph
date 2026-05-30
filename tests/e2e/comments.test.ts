import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

async function addComment(page: import('@playwright/test').Page, text: string) {
  const firstBlock = page.locator('#content .md-block').first();
  await firstBlock.hover();
  await firstBlock.locator('.comment-btn').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(page.locator('.comment-item').first()).toBeVisible({
    timeout: 3000,
  });
}

test.beforeEach(async ({ page }) => {
  if (existsSync(COMMENTS_FILE)) rmSync(COMMENTS_FILE);
  await page.goto('/');
  await expect(page.locator('#content .md-block').first()).toBeVisible({
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

test.describe('コメントパネルの開閉', () => {
  test('コメントボタンでパネルが開く', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(page.locator('#comments-panel.open')).toBeVisible();
  });

  test('✕ ボタンでパネルが閉じる', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(page.locator('#comments-panel.open')).toBeVisible();
    await page.locator('#btn-close-panel').click();
    await expect(page.locator('#comments-panel.open')).not.toBeVisible();
  });

  test('コメント追加後にパネルが自動で開く', async ({ page }) => {
    await addComment(page, 'auto open test');
    await expect(page.locator('#comments-panel.open')).toBeVisible();
  });
});

test.describe('コメントの削除', () => {
  test('削除ボタンでコメントが消える', async ({ page }) => {
    await addComment(page, 'delete me');
    await expect(page.locator('.comment-item')).toHaveCount(1);
    await page.locator('.c-del').first().click();
    await expect(page.locator('.comment-item')).toHaveCount(0);
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('削除後にコメントファイルから除去される', async ({ page }) => {
    await addComment(page, 'to delete');
    await page.locator('.c-del').first().click();
    await expect(page.locator('.comment-item')).toHaveCount(0);
    if (existsSync(COMMENTS_FILE)) {
      const saved = JSON.parse(readFileSync(COMMENTS_FILE, 'utf-8'));
      expect(saved).toHaveLength(0);
    }
  });
});

test.describe('コメントの編集', () => {
  test('編集ボタンでモーダルが開き更新できる', async ({ page }) => {
    await addComment(page, 'original text');
    await page.locator('.c-edit').first().click();
    await expect(page.locator('#comment-modal')).toBeVisible();
    await expect(page.locator('#btn-submit')).toContainText('更新');

    const ta = page.locator('#comment-ta');
    await ta.fill('updated text');
    await page.locator('#btn-submit').click();

    await expect(page.locator('.comment-item .c-text')).toContainText(
      'updated text',
    );
  });
});

test.describe('全コメント削除', () => {
  test('ゴミ箱アイコン → 確認モーダル → 削除', async ({ page }) => {
    await addComment(page, 'comment 1');
    await addComment(page, 'comment 2');
    await expect(page.locator('.comment-item')).toHaveCount(2);

    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-ok').click();

    await expect(page.locator('#comments-panel.open')).not.toBeVisible();
    await page.locator('#btn-comments').click();
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('確認モーダルでキャンセルするとコメントが残る', async ({ page }) => {
    await addComment(page, 'keep me');
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();
    await expect(page.locator('.comment-item')).toHaveCount(1);
  });
});

test.describe('コメントクリックでコンテンツハイライト', () => {
  test('コメントをクリックすると対応ブロックに highlighted クラスが付く', async ({
    page,
  }) => {
    await addComment(page, 'highlight test');

    const firstBlock = page.locator('#content .md-block').first();
    const ls = await firstBlock.getAttribute('data-ls');

    await page.locator('.comment-item').first().click();

    await expect(
      page.locator(`#content .md-block[data-ls="${ls}"]`),
    ).toHaveClass(/highlighted/, { timeout: 1000 });
  });

  test('highlighted クラスはしばらく後に消える', async ({ page }) => {
    await addComment(page, 'transient highlight');

    const firstBlock = page.locator('#content .md-block').first();
    const ls = await firstBlock.getAttribute('data-ls');

    await page.locator('.comment-item').first().click();
    await expect(
      page.locator(`#content .md-block[data-ls="${ls}"]`),
    ).toHaveClass(/highlighted/, { timeout: 1000 });

    // 1.4s アニメーション後に消える
    await expect(
      page.locator(`#content .md-block[data-ls="${ls}"]`),
    ).not.toHaveClass(/highlighted/, { timeout: 2500 });
  });

  test('コメントクリック後に対応ブロックがビューポートに入る', async ({
    page,
  }) => {
    await addComment(page, 'scroll test');
    const firstBlock = page.locator('#content .md-block').first();
    const ls = await firstBlock.getAttribute('data-ls');
    await page.locator('.comment-item').first().click();
    await expect(
      page.locator(`#content .md-block[data-ls="${ls}"]`),
    ).toBeInViewport({ timeout: 2000 });
  });
});

test.describe('コメントパネルのリサイズ', () => {
  test('リサイズハンドルを上にドラッグするとパネルが高くなる', async ({
    page,
  }) => {
    await addComment(page, 'resize test');
    await expect(page.locator('#comments-panel.open')).toBeVisible();

    const panel = page.locator('#comments-panel');
    const handle = page.locator('#panel-resize-handle');

    const initialHeight = await panel.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('resize handle not found');

    const cx = handleBox.x + handleBox.width / 2;
    const cy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 120, { steps: 10 });
    await page.mouse.up();

    const newHeight = await panel.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    expect(newHeight).toBeGreaterThan(initialHeight);
  });

  test('パネル高さが localStorage に保存される', async ({ page }) => {
    await addComment(page, 'height persist');
    // Wait for the 0.2s panel-open CSS transition to finish
    await page.waitForTimeout(300);

    const handle = page.locator('#panel-resize-handle');
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('resize handle not found');

    const cx = handleBox.x + handleBox.width / 2;
    const cy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 80, { steps: 8 });
    await page.mouse.up();

    // stopDrag saves offsetHeight synchronously, but React may not have
    // flushed the new height to the DOM yet — wait until it's set.
    await page.waitForFunction(
      () => localStorage.getItem('nymph-panel-height') !== null,
      { timeout: 2000 },
    );
    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-panel-height'),
    );
    expect(Number(saved)).toBeGreaterThan(0);
  });
});

test.describe('テーマ切替', () => {
  test('テーマボタンで light/dark が切り替わる', async ({ page }) => {
    const initial = await page.evaluate(
      () => document.documentElement.dataset.theme ?? 'dark',
    );
    await page.locator('#btn-theme').click();
    const next = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(next).not.toBe(initial);
  });

  test('テーマが localStorage に保存される', async ({ page }) => {
    await page.locator('#btn-theme').click();
    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-theme'),
    );
    expect(saved).not.toBeNull();
  });
});

test.describe('複数コメント', () => {
  test('コメントが ls 順に並ぶ', async ({ page }) => {
    await addComment(page, 'first comment');
    const secondBlock = page.locator('#content .md-block').nth(1);
    await secondBlock.hover();
    await secondBlock.locator('.comment-btn').click();
    await page.locator('#comment-ta').fill('second comment');
    await page.locator('#btn-submit').click();
    await expect(page.locator('.comment-item')).toHaveCount(2);

    const items = page.locator('.comment-item .c-text');
    await expect(items.first()).toContainText('first comment');
    await expect(items.nth(1)).toContainText('second comment');
  });

  test('コメント数がツールバーに表示される', async ({ page }) => {
    await addComment(page, 'count test');
    await expect(page.locator('#comment-count')).toContainText('1');
  });
});
