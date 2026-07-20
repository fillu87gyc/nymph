import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

test.beforeEach(async ({ page, fixturePath, commentsPath, reviewDir }) => {
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
  rmSync(reviewDir, { recursive: true, force: true });
  writeFileSync(fixturePath, ORIGINAL);
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(async ({ page, fixturePath, commentsPath, reviewDir }) => {
  writeFileSync(fixturePath, ORIGINAL);
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
  rmSync(reviewDir, { recursive: true, force: true });
  // ドロップファイルのタブ系テストは元ファイルをサーバーから close するため、
  // 同一 worker の後続テストに影響しないよう active file を復元する。
  await page.request.post('/open-file', { data: { path: fixturePath } });
});

test.describe('ドラッグ＆ドロップのオーバーレイ', () => {
  test('dragover でドロップ用オーバーレイが表示される', async ({ page }) => {
    await expect(page.locator('#drop-overlay')).toHaveCount(0);

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(
        new File(['# Dropped\n'], 'dropped.md', { type: 'text/plain' }),
      );
      return dt;
    });
    await page.dispatchEvent('#app', 'dragover', { dataTransfer });

    await expect(page.locator('#drop-overlay')).toBeVisible();
    await expect(page.locator('#drop-overlay')).toContainText('ドロップ');
  });

  test('dragleave でオーバーレイが消える', async ({ page }) => {
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await page.dispatchEvent('#app', 'dragover', { dataTransfer });
    await expect(page.locator('#drop-overlay')).toBeVisible();

    // relatedTarget なしの dragleave はウィンドウ外への離脱とみなされ、解除される
    await page.dispatchEvent('#app', 'dragleave', { dataTransfer });
    await expect(page.locator('#drop-overlay')).toHaveCount(0);
  });
});

test.describe('ドロップファイルのタブ', () => {
  // ドロップ後に元ファイルを閉じると __dropped__ だけが残る状態を再現し、
  // コンテンツが 403 にならず表示されることと閉じるボタンの動作を確認する。
  test('元ファイルを閉じるとドロップファイルのコンテンツが表示され、閉じるボタンがある', async ({
    page,
    fixturePath,
  }) => {
    const origName = basename(fixturePath);

    // サーバーに dropped コンテンツを直接セット
    await page.request.post('/switch-file', {
      data: { content: '# Dropped Content\n', filename: 'dropped.md' },
    });

    // 元ファイルを閉じる（ページはまだリロードしない）
    await page.request.post('/close-file', { data: { path: fixturePath } });

    // ページをリロード → クライアントが /files を再取得し activeFile: '__dropped__' を得る
    await page.reload();

    // __dropped__ タブが表示される
    const droppedTab = page.locator('#file-tabs button', {
      hasText: 'dropped.md',
    });
    await expect(droppedTab).toBeVisible({ timeout: 5000 });

    // コンテンツが 403 にならずロードされる（"ファイルを読み込んでいます…" で止まらない）
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    // 閉じるボタンが存在する
    await expect(droppedTab.locator('span')).toBeVisible();

    // 閉じるボタンをクリックするとタブが消える
    await droppedTab.locator('span').click();
    await expect(droppedTab).toHaveCount(0, { timeout: 3000 });

    // 元ファイルタブも残っていない（dropped だけだった）
    await expect(
      page.locator('#file-tabs button', { hasText: origName }),
    ).toHaveCount(0);
  });
});

test.describe('トーストの表示と自動消滅', () => {
  test('コメントなしでレビューをコピーすると通知トーストが出て、やがて消える', async ({
    page,
  }) => {
    await page.locator('#btn-copy').click();
    const toast = page.locator('#toast');
    await expect(toast).toContainText('コメントがありません', {
      timeout: 3000,
    });
    // 約 2.4s 後に自動で消える
    await expect(toast).toHaveCount(0, { timeout: 4000 });
  });
});

test.describe('ファイルパスのコピー', () => {
  test('ツールバーのボタンで開いているファイルの絶対パスをコピーする', async ({
    page,
    context,
    fixturePath,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.locator('#btn-copy-path').click();

    const toast = page.locator('#toast');
    await expect(toast).toContainText('ファイルパスをコピーしました', {
      timeout: 3000,
    });

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(fixturePath);
  });

  test('開いているファイルがないときはボタンが無効化される', async ({
    page,
    fixturePath,
  }) => {
    await page.request.post('/close-file', { data: { path: fixturePath } });
    await page.reload();

    await expect(page.locator('#btn-copy-path')).toBeDisabled();
  });
});
