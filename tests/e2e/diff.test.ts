import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = join(process.cwd(), 'tests/fixtures/sample.md');
const ORIGINAL = readFileSync(FIXTURE, 'utf-8');
const COMMENTS_FILE = `${FIXTURE}.comments.json`;

test.beforeEach(async ({ page }) => {
  if (existsSync(COMMENTS_FILE)) rmSync(COMMENTS_FILE);
  writeFileSync(FIXTURE, ORIGINAL);
  await page.goto('/');
  await expect(page.locator('#content .md-block').first()).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(() => {
  writeFileSync(FIXTURE, ORIGINAL);
  try {
    rmSync(COMMENTS_FILE);
  } catch {
    /* ignore */
  }
});

test.describe('チェックポイント', () => {
  test('チェックポイントボタンで has-checkpoint クラスが付く', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveClass(/has-checkpoint/);
  });

  test('チェックポイント設定後にトーストが表示される', async ({ page }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#toast')).toContainText('チェックポイント', {
      timeout: 3000,
    });
  });
});

test.describe('diff 表示', () => {
  test('チェックポイント設定後にファイルを変更すると diff-changed ブロックが表示される', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveClass(/has-checkpoint/);

    writeFileSync(
      FIXTURE,
      ORIGINAL.replace(
        'Some content here.',
        'Modified content here.\nExtra new line.',
      ),
    );
    await expect(page.locator('#content')).toContainText('Modified content', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveClass(/active/);

    await expect(page.locator('#content .diff-changed').first()).toBeVisible({
      timeout: 3000,
    });
  });

  test('diff ON のとき変更ブロックに diff-side-ins / diff-side-del が表示される', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      FIXTURE,
      ORIGINAL.replace('Some content here.', 'Replaced content.'),
    );
    await expect(page.locator('#content')).toContainText('Replaced content', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('#content .diff-changed').first()).toBeVisible({
      timeout: 3000,
    });

    // At least one of ins or del side-panel must be present
    const sideCount = await page.locator('.diff-side').count();
    expect(sideCount).toBeGreaterThan(0);
  });

  test('diff ON のとき diff-side-ins に追加行テキストが含まれる', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      FIXTURE,
      ORIGINAL.replace('Some content here.', 'UNIQUE_INS_TEXT'),
    );
    await expect(page.locator('#content')).toContainText('UNIQUE_INS_TEXT', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('.diff-side-ins').first()).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.diff-side-ins').first()).toContainText(
      'UNIQUE_INS_TEXT',
    );
  });

  test('diff OFF にすると diff-changed が消える', async ({ page }) => {
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      FIXTURE,
      ORIGINAL.replace('Some content here.', 'Changed for diff off test.'),
    );
    await expect(page.locator('#content')).toContainText(
      'Changed for diff off test',
      { timeout: 5000 },
    );

    await page.locator('#btn-diff').click();
    await expect(page.locator('#content .diff-changed').first()).toBeVisible({
      timeout: 3000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).not.toHaveClass(/active/);
    await expect(page.locator('#content .diff-changed')).toHaveCount(0);
  });

  test('チェックポイントなしで diff ON にしても diff-changed は表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveClass(/active/);
    await expect(page.locator('#content .diff-changed')).toHaveCount(0);
  });

  test('ファイルを変更していない場合は diff-changed が表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await page.locator('#btn-diff').click();
    await expect(page.locator('#content .diff-changed')).toHaveCount(0);
  });
});
