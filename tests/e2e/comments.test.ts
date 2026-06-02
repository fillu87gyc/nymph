import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

async function addComment(page: import('@playwright/test').Page, text: string) {
  const tableBlock = page
    .locator('#content [data-testid="md-block"][data-block-type="table"]')
    .first();
  await tableBlock.hover();
  await tableBlock.locator('[data-testid="comment-btn"]').click();
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

test.describe('コメントパネルの開閉', () => {
  test('コメントボタンでパネルが開く', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
  });

  test('✕ ボタンでパネルが閉じる', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    await page.locator('#btn-close-panel').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).not.toBeVisible();
  });

  test('コメント追加後にパネルが自動で開く', async ({ page }) => {
    await addComment(page, 'auto open test');
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
  });
});

test.describe('コメントの削除', () => {
  test('削除ボタンでコメントが消える', async ({ page }) => {
    await addComment(page, 'delete me');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await page.locator('[data-testid="c-del"]').first().click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('削除後にコメントファイルから除去される', async ({ page }) => {
    await addComment(page, 'to delete');
    await page.locator('[data-testid="c-del"]').first().click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
    if (existsSync(COMMENTS_FILE)) {
      const saved = JSON.parse(readFileSync(COMMENTS_FILE, 'utf-8'));
      expect(saved).toHaveLength(0);
    }
  });
});

test.describe('コメントの編集', () => {
  test('編集ボタンでモーダルが開き更新できる', async ({ page }) => {
    await addComment(page, 'original text');
    await page.locator('[data-testid="c-edit"]').first().click();
    await expect(page.locator('#comment-modal')).toBeVisible();
    await expect(page.locator('#btn-submit')).toContainText('更新');

    const ta = page.locator('#comment-ta');
    await ta.fill('updated text');
    await page.locator('#btn-submit').click();

    await expect(
      page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
    ).toContainText('updated text');
  });
});

test.describe('全コメント削除', () => {
  test('ゴミ箱アイコン → 確認モーダル → 削除', async ({ page }) => {
    await addComment(page, 'comment 1');
    await addComment(page, 'comment 2');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-ok').click();

    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).not.toBeVisible();
    await page.locator('#btn-comments').click();
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('確認モーダルでキャンセルするとコメントが残る', async ({ page }) => {
    await addComment(page, 'keep me');
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
  });
});

test.describe('コメントクリックでコンテンツハイライト', () => {
  test('コメントをクリックすると対応ブロックがハイライトされる', async ({
    page,
  }) => {
    await addComment(page, 'highlight test');

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const ls = await tableBlock.getAttribute('data-ls');

    await page.locator('[data-testid="comment-item"]').first().click();

    await expect(
      page.locator(`#content [data-testid="md-block"][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });
  });

  test('ハイライトはしばらく後に消える', async ({ page }) => {
    await addComment(page, 'transient highlight');

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const ls = await tableBlock.getAttribute('data-ls');

    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator(`#content [data-testid="md-block"][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });

    // 1.4s アニメーション後に消える
    await expect(
      page.locator(`#content [data-testid="md-block"][data-ls="${ls}"]`),
    ).toHaveAttribute('data-highlighted', 'false', { timeout: 2500 });
  });

  test('コメントクリック後に対応ブロックがビューポートに入る', async ({
    page,
  }) => {
    await addComment(page, 'scroll test');
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const ls = await tableBlock.getAttribute('data-ls');
    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator(`#content [data-testid="md-block"][data-ls="${ls}"]`),
    ).toBeInViewport({ timeout: 2000 });
  });
});

test.describe('コメントパネルのリサイズ', () => {
  test('リサイズハンドルを上にドラッグするとパネルが高くなる', async ({
    page,
  }) => {
    await addComment(page, 'resize test');
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();

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

  test('保存したパネル高さがリロード後に復元される', async ({ page }) => {
    // 既定(210)と十分に異なる高さを localStorage に保存しておく
    await page.evaluate(() =>
      localStorage.setItem('nymph-panel-height', '380'),
    );
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    // open 用の height トランジション(0.2s)が終わるのを待つ
    await page.waitForTimeout(300);

    const height = await page
      .locator('#comments-panel')
      .evaluate((el) => (el as HTMLElement).offsetHeight);
    // 既定値(210)ではなく保存値(380)付近に復元されていること
    expect(height).toBeGreaterThan(300);
  });
});

test.describe('コメントボタンの表示（CSS hover）', () => {
  test('既定では非表示、ホバーで表示される', async ({ page }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const btn = tableBlock.locator('[data-testid="comment-btn"]');

    // ホバー前は CSS で opacity:0（= 非表示）
    await expect(btn).toHaveCSS('opacity', '0');

    await tableBlock.hover();
    // ホバーで opacity:1 まで遷移する
    await expect(btn).toHaveCSS('opacity', '1');
  });

  test('コメントのあるブロックではホバーなしでも表示される', async ({
    page,
  }) => {
    await addComment(page, 'visible without hover');
    // パネルを閉じてブロックからマウスを離した状態にする
    await page.locator('#btn-close-panel').click();
    await page.mouse.move(0, 0);

    const btn = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first()
      .locator('[data-testid="comment-btn"]');
    await expect(btn).toHaveCSS('opacity', '1');
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
    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('second comment');
    await page.locator('#btn-submit').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    const items = page.locator(
      '[data-testid="comment-item"] [data-testid="c-text"]',
    );
    await expect(items.first()).toContainText('first comment');
    await expect(items.nth(1)).toContainText('second comment');
  });

  test('コメント数がツールバーに表示される', async ({ page }) => {
    await addComment(page, 'count test');
    await expect(page.locator('#comment-count')).toContainText('1');
  });
});

test.describe('削除済みコメントの表示', () => {
  test('対象テキストが存在しない selection コメントに「削除済み」バッジが表示される', async ({
    page,
  }) => {
    // /files でアクティブファイルのフルパスを取得（reuseExistingServer で別ファイルの可能性あり）
    const filesRes = await page.request.get('/files');
    const { activeFile } = await filesRes.json();
    const activeCommentsFile = activeFile
      ? `${activeFile}.comments.json`
      : COMMENTS_FILE;

    const orphanedComment = [
      {
        id: 1,
        ls: 3,
        le: 3,
        block_type: 'selection',
        context: '【NYMPH_TEST_ORPHAN_DOES_NOT_EXIST_XYZ_99999】',
        selection_offset: 0,
        text: '孤立コメント',
      },
    ];
    writeFileSync(activeCommentsFile, JSON.stringify(orphanedComment));

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="c-deleted"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="c-deleted"]')).toContainText(
      '削除済み',
    );

    try {
      rmSync(activeCommentsFile);
    } catch {
      /* ignore */
    }
  });

  test('対象ブロックが存在する block コメントには「削除済み」バッジが表示されない', async ({
    page,
  }) => {
    // UI 経由で block コメントを追加（ls/le が正しく設定され、ブロックが存在する）
    await addComment(page, '有効コメント');
    // useEffect の反映を待つ
    await page.waitForTimeout(600);
    await expect(page.locator('[data-testid="c-deleted"]')).not.toBeVisible();
  });
});
