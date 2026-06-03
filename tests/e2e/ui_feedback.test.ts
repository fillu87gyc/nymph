import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

test.beforeEach(async ({ page, fixturePath, commentsPath }) => {
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
  writeFileSync(fixturePath, ORIGINAL);
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(async ({ fixturePath, commentsPath }) => {
  writeFileSync(fixturePath, ORIGINAL);
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
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
