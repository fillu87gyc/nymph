/**
 * 差分チェックモード VRT
 *
 * GitHub の "Files changed" 風の全画面 split ビュー（左=チェックポイント、
 * 右=現在、余白なし・行番号付き・文字単位ハイライト）に特化した VRT。
 *
 * フルスペック VRT が「全要素を 1 枚に詰め込みすぎ」だったため、diff の見た目
 * 検証はこちらに分離している（fullspec 側は差分チェックモードを ON にしない）。
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openOverflowMenu, type Page, test } from './fixtures.ts';
import { stabilizeVrt } from './vrt.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

// before を読み込み → checkpoint → after に変更 → 差分チェックモード ON、までを行う。
// afterMarker は変更後の本文に現れる文字列。本文が SSE で再描画され切ってから
// モードを切り替えることでスクリーンショットを安定させる。
async function produceDiff(
  page: Page,
  fixturePath: string,
  before: string,
  after: string,
  afterMarker: string,
) {
  writeFileSync(fixturePath, before, 'utf-8');
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 8000,
  });

  // チェックポイント設定は ⋯ メニューの中。項目クリックでメニューは閉じる
  // ため、状態確認には開き直す。
  await openOverflowMenu(page);
  await page.locator('#btn-checkpoint').click();
  await openOverflowMenu(page);
  await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
    'data-has-checkpoint',
    'true',
    { timeout: 5000 },
  );

  writeFileSync(fixturePath, after, 'utf-8');
  await expect(page.locator('#content')).toContainText(afterMarker, {
    timeout: 8000,
  });
  await page.locator('#btn-diff').click();
  await expect(page.locator('#btn-diff')).toHaveAttribute(
    'data-active',
    'true',
    {
      timeout: 3000,
    },
  );
  await expect(
    page.locator('[data-testid="diff-cell-old"][data-line-type="delete"]'),
  ).toBeVisible({
    timeout: 5000,
  });
  // フォント確定を待ってから安定化 CSS を注入する
  await stabilizeVrt(page);
}

test.describe('差分チェックモード VRT', () => {
  test.beforeEach(async ({ commentsPath, legacyCheckpointPath, reviewDir }) => {
    rmSync(commentsPath, { force: true });
    rmSync(legacyCheckpointPath, { force: true });
    // 新store（checkpoint 含む）はワーカー内の他 VRT テストと fixturePath を
    // 共有するため、リトライ等で再実行されても汚染されないよう掃除する。
    rmSync(reviewDir, { recursive: true, force: true });
  });

  test.afterEach(
    async ({ fixturePath, commentsPath, legacyCheckpointPath, reviewDir }) => {
      writeFileSync(fixturePath, ORIGINAL, 'utf-8');
      rmSync(commentsPath, { force: true });
      rmSync(legacyCheckpointPath, { force: true });
      rmSync(reviewDir, { recursive: true, force: true });
    },
  );

  test('1 行の変更: 全画面 split で同じ行に左=削除・右=追加、変更箇所だけハイライト', async ({
    page,
    fixturePath,
  }) => {
    await page.setViewportSize({ width: 1400, height: 360 });
    await produceDiff(
      page,
      fixturePath,
      '# Diff VRT\n\nThe quick brown fox jumps over the dog.\n',
      '# Diff VRT\n\nThe quick red fox leaps over the dog.\n',
      'leaps over',
    );
    await expect(page).toHaveScreenshot('diff-split-single.png', {
      maxDiffPixels: 800,
    });
  });

  test('複数行の変更: 箇条書きの追加が右ペインに 1 行ずつ積み重なる', async ({
    page,
    fixturePath,
  }) => {
    await page.setViewportSize({ width: 1400, height: 480 });
    await produceDiff(
      page,
      fixturePath,
      '# Diff VRT\n\n- ようこそ\n- ここは岐阜県です\n',
      '# Diff VRT\n\n- ようこそ\n- ここは\n- 水と山が綺麗な\n- 東海道新幹線が通る\n- 静岡県です\n',
      '東海道新幹線が通る',
    );
    // 追加 4 行がすべて描画されるまで待つ
    await expect(
      page.locator('[data-testid="diff-cell-new"][data-line-type="insert"]'),
    ).toHaveCount(4, {
      timeout: 5000,
    });
    await expect(page).toHaveScreenshot('diff-split-multiline.png', {
      maxDiffPixels: 800,
    });
  });
});
