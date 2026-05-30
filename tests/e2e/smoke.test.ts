import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');

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

    // Hover first block and click comment button
    const firstBlock = page.locator('#content .md-block').first();
    await firstBlock.hover();
    await firstBlock.locator('.comment-btn').click();

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
    writeFileSync(
      FIXTURE,
      '# Sample\n\nThis is a test file for nymph E2E tests.\n\n## Section\n\nSome content here.\n\n```ts\nconst x = 1;\n```\n',
    );
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
