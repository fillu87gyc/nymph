import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

test.describe('smoke: 起動 → コンテンツ表示', () => {
  test('ページが正常に読み込まれる', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="brand"]')).toContainText('nymph');
  });

  test('ブランドロゴ横にバージョンが表示される', async ({ page }) => {
    await page.goto('/');
    const versionBadge = page.locator('[data-testid="brand-version"]');
    await expect(versionBadge).toBeVisible({ timeout: 5000 });
    const text = await versionBadge.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
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

  test('ファイルタブの縦幅がファイル名を切らずに収まる', async ({ page }) => {
    await page.goto('/');
    const tab = page.locator('#file-tabs button').first();
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  });

  test('ファイルタブはツールバーとは別の段で表示される', async ({ page }) => {
    await page.goto('/');
    const toolbarBox = await page.locator('#toolbar').boundingBox();
    const tabsBox = await page.locator('#file-tabs').boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(tabsBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
  });

  test('コネクションステータスバッジが表示されている', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#connection-status')).toBeVisible();
    await expect(page.locator('#connection-status')).toContainText(
      'コネクション',
    );
  });

  test('コネクションステータスバッジが接続状態を表示', async ({ page }) => {
    await page.goto('/');
    const connectionStatus = page.locator('#connection-status');
    const connectionDot = connectionStatus.locator(
      '[data-testid="connection-dot"]',
    );

    // 起動直後は接続中
    await expect(connectionDot).toHaveAttribute('data-connected', 'true');
    await expect(connectionStatus).toHaveAttribute('data-connected', 'true');

    // 3秒後もハートビートで接続を維持していること
    await page.waitForTimeout(3000);
    await expect(connectionDot).toHaveAttribute('data-connected', 'true');
    await expect(connectionStatus).toHaveAttribute('data-connected', 'true');
  });
});

test.describe('コメント: 追加 → 保存 → リロード後復元', () => {
  test.afterEach(async ({ commentsPath }) => {
    try {
      rmSync(commentsPath);
    } catch {
      /* ignore */
    }
  });

  test('コメントを追加してリロード後も残る', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    // Hover table block and click comment button
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();

    // Type and submit
    await page.locator('#comment-ta').fill('E2E test comment');
    await page.locator('#btn-submit').click();

    // Verify visible in panel
    await expect(
      page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
    ).toContainText('E2E test comment');

    // Reload and verify persistence
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    // Open comments panel
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
    ).toContainText('E2E test comment');
  });
});

test.describe('SSE: ファイル変更で再描画', () => {
  test.afterEach(async ({ fixturePath }) => {
    writeFileSync(fixturePath, ORIGINAL);
  });

  test('外部ファイル書き換えでコンテンツが更新される', async ({
    page,
    fixturePath,
  }) => {
    await page.goto('/');
    await expect(page.locator('#content h1')).toContainText('Sample', {
      timeout: 5000,
    });

    // Modify the file externally
    writeFileSync(fixturePath, '# Updated Title\n\nNew content.\n');

    // Wait for SSE reload
    await expect(page.locator('#content h1')).toContainText('Updated Title', {
      timeout: 5000,
    });
  });
});
