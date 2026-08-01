import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  openOverflowMenu,
  openSettingsMenu,
  type Page,
  test,
} from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

// テーブル（Sample 見出し配下、L5-8）にコメントを1件付ける。
async function addTableComment(page: Page, text: string) {
  const tableBlock = page
    .locator('#content [data-testid="md-block"][data-block-type="table"]')
    .first();
  await tableBlock.hover();
  await tableBlock.locator('[data-testid="comment-btn"]').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({ timeout: 3000 });
  // コメントパネルの開閉トランジション待ち（他ブロックの hover が外れないように）
  await page.waitForTimeout(300);
}

// checkpoint → Section 見出し配下（L12）の行を編集、まで行う。
// diff モードには入れない（呼び出し側で必要に応じて入る）。
async function checkpointThenEditSection(page: Page, fixturePath: string) {
  await openOverflowMenu(page);
  await page.locator('#btn-checkpoint').click();
  await openOverflowMenu(page);
  await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
    'data-has-checkpoint',
    'true',
  );
  writeFileSync(
    fixturePath,
    ORIGINAL.replace('Some content here.', 'Some different content here.'),
  );
  await expect(page.locator('#content')).toContainText(
    'Some different content here.',
    { timeout: 5000 },
  );
}

test.beforeEach(async ({ page, fixturePath, commentsPath, reviewDir }) => {
  rmSync(commentsPath, { force: true });
  rmSync(reviewDir, { recursive: true, force: true });
  writeFileSync(fixturePath, ORIGINAL);
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.afterEach(async ({ fixturePath, commentsPath, reviewDir }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(commentsPath, { force: true });
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('アウトラインパネル', () => {
  test('トグルボタンで開閉する', async ({ page }) => {
    await expect(page.locator('[data-testid="toc-panel"]')).not.toBeVisible();
    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(page.locator('[data-testid="toc-panel"]')).toBeVisible();
    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(page.locator('[data-testid="toc-panel"]')).not.toBeVisible();
  });

  test('sample.md の見出しが抽出されて表示される', async ({ page }) => {
    await page.locator('[data-testid="toc-toggle"]').click();
    const items = page.locator('[data-testid="toc-item"]');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('Sample');
    await expect(items.nth(1)).toHaveText('Section');
    await expect(items.nth(2)).toHaveText('Diagram');
  });

  test('見出しクリックで対応セクションまでスクロールしてハイライトする', async ({
    page,
  }) => {
    await page.locator('[data-testid="toc-toggle"]').click();

    const diagramHeading = page
      .locator('#content [data-testid="md-block"][data-block-type="heading"]')
      .filter({ hasText: 'Diagram' });
    const lineStart = await diagramHeading.getAttribute('data-line-start');

    await page.locator('[data-testid="toc-item"]').nth(2).click();

    await expect(diagramHeading).toBeInViewport({ timeout: 3000 });
    await expect(
      page.locator(`#content [data-block][data-line-start="${lineStart}"]`),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });
  });

  test('差分チェックモードでもボタンは有効で、並んで表示できる', async ({
    page,
  }) => {
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 3000,
    });
    const tocToggle = page.locator('[data-testid="toc-toggle"]');
    await expect(tocToggle).toBeEnabled();

    await tocToggle.click();
    await expect(page.locator('[data-testid="toc-panel"]')).toBeVisible();
    // スプリットビュー自体は消えず、隣に並ぶ
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible();
  });

  test('未解決コメントのある見出しにコメント数バッジが付く（既定は comments モード）', async ({
    page,
  }) => {
    await addTableComment(page, 'テーブルへの指摘');
    await page.locator('[data-testid="toc-toggle"]').click();

    const items = page.locator('[data-testid="toc-item"]');
    await expect(
      items.nth(0).locator('[data-testid="toc-badge-comments"]'),
    ).toHaveText('1');
    await expect(
      items.nth(1).locator('[data-testid="toc-badge-comments"]'),
    ).toHaveCount(0);
  });

  test('設定でバッジを非表示にすると見出しにも合計にもバッジが出ない', async ({
    page,
  }) => {
    await addTableComment(page, 'テーブルへの指摘');
    await openSettingsMenu(page);
    await page.locator('[data-testid="outline-badge-off"]').click();

    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(
      page.locator('[data-testid="toc-badge-comments"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-testid="toc-header-meta"]')).toHaveCount(
      0,
    );
  });

  test('diff モードのバッジはチェックポイントからの増減を見出しごとに表示する', async ({
    page,
    fixturePath,
  }) => {
    await checkpointThenEditSection(page, fixturePath);
    await openSettingsMenu(page);
    await page.locator('[data-testid="outline-badge-diff"]').click();

    await page.locator('[data-testid="toc-toggle"]').click();
    const items = page.locator('[data-testid="toc-item"]');
    // Section 見出し配下（L12）を編集したので、そこにだけ diff バッジが付く
    await expect(
      items.nth(1).locator('[data-testid="toc-badge-diff"]'),
    ).toBeVisible();
    await expect(
      items.nth(0).locator('[data-testid="toc-badge-diff"]'),
    ).toHaveCount(0);
  });

  test('diff モードでもチェックポイント未設定なら comments 表示にフォールバックする', async ({
    page,
  }) => {
    await addTableComment(page, 'テーブルへの指摘');
    await openSettingsMenu(page);
    await page.locator('[data-testid="outline-badge-diff"]').click();

    await page.locator('[data-testid="toc-toggle"]').click();
    await expect(
      page
        .locator('[data-testid="toc-item"]')
        .nth(0)
        .locator('[data-testid="toc-badge-comments"]'),
    ).toHaveText('1');
  });

  test('バッジ設定は再読み込み後も保持される', async ({ page }) => {
    await openSettingsMenu(page);
    await page.locator('[data-testid="outline-badge-both"]').click();

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await openSettingsMenu(page);
    await expect(
      page.locator('[data-testid="outline-badge-both"]'),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
