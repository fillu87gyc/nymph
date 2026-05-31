import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const ORIGINAL = readFileSync(FIXTURE, 'utf-8');

test.describe('smoke: 起動 → コンテンツ表示', () => {
  test('ページが正常に読み込まれる', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand')).toContainText('nymph');
  });

  test('Markdown コンテンツが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#content h1')).toContainText('Sample', {
      timeout: 5000,
    });
  });

  test('ファイルタブが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#file-tabs')).toBeVisible();
  });

  test('コネクションステータスバッジが表示されている', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#connection-status')).toBeVisible();
    await expect(page.locator('#connection-status')).toContainText('コネクション');
  });

  test('コネクションステータスバッジが接続状態を表示', async ({ page }) => {
    await page.goto('/');
    const connectionStatus = page.locator('#connection-status');
    const connectionDot = connectionStatus.locator('.connection-dot');

    // 接続中は緑色の点が表示される
    await expect(connectionDot).not.toHaveClass(/error/);
    await expect(connectionStatus).not.toHaveClass(/disconnected/);
  });
});

test.describe('コメント: 追加 → 保存 → リロード後復元', () => {
  const commentsFile = `${FIXTURE}.comments.json`;

  test.afterEach(() => {
    try {
      rmSync(commentsFile);
    } catch {
      /* ignore */
    }
  });

  test('コメントを追加してリロード後も残る', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#content .md-block').first()).toBeVisible({
      timeout: 5000,
    });

    // Hover table block and click comment button
    const tableBlock = page
      .locator('#content .md-block[data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('.comment-btn').click();

    // Type and submit
    await page.locator('#comment-ta').fill('E2E test comment');
    await page.locator('#btn-submit').click();

    // Verify visible in panel
    await expect(page.locator('.comment-item .c-text')).toContainText(
      'E2E test comment',
    );

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('#content .md-block').first()).toBeVisible({
      timeout: 5000,
    });

    // Open comments panel
    await page.locator('#btn-comments').click();
    await expect(page.locator('.comment-item .c-text')).toContainText(
      'E2E test comment',
    );
  });
});

test.describe('SSE: ファイル変更で再描画', () => {
  test.afterEach(() => {
    writeFileSync(FIXTURE, ORIGINAL);
  });

  test('外部ファイル書き換えでコンテンツが更新される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#content h1')).toContainText('Sample', {
      timeout: 5000,
    });

    // Modify the file externally
    writeFileSync(FIXTURE, '# Updated Title\n\nNew content.\n');

    // Wait for SSE reload
    await expect(page.locator('#content h1')).toContainText('Updated Title', {
      timeout: 5000,
    });
  });
});
