/**
 * レガシーサイドカー（<file>.comments.json / <file>.checkpoint）から
 * 新store（XDG data dir 配下 `reviews/<key>/`）への自動移行 E2E。
 *
 * 移行はサーバー側の読み取り時（src/reviewStore.ts）に発生する。ここでは
 * 実際にアプリを起動し、レガシーファイルを事前に置いた状態でページを開いた
 * ときに、(1) 内容が正しく表示され (2) レガシーファイルが削除され
 * (3) 新store側にエンベロープ／プレーンテキスト形式で保存される、を検証する。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openOverflowMenu, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

test.beforeEach(
  async ({ fixturePath, commentsPath, legacyCheckpointPath, reviewDir }) => {
    writeFileSync(fixturePath, ORIGINAL);
    rmSync(commentsPath, { force: true });
    rmSync(legacyCheckpointPath, { force: true });
    rmSync(reviewDir, { recursive: true, force: true });
  },
);

test.afterEach(
  async ({ fixturePath, commentsPath, legacyCheckpointPath, reviewDir }) => {
    writeFileSync(fixturePath, ORIGINAL);
    rmSync(commentsPath, { force: true });
    rmSync(legacyCheckpointPath, { force: true });
    rmSync(reviewDir, { recursive: true, force: true });
  },
);

test.describe('レガシーサイドカーからの自動移行', () => {
  test('レガシー <file>.comments.json を事前に置いて開くと、表示され・レガシーが削除され・新storeへエンベロープ形式で移行される', async ({
    page,
    commentsPath,
    reviewCommentsPath,
  }) => {
    const legacyComments = [
      {
        id: 1,
        lineStart: 3,
        lineEnd: 3,
        block_type: 'paragraph',
        context: 'Some content here.',
        text: 'legacy migration test comment',
      },
    ];
    // レガシー形式（裸配列）を直接置く。移行前なので新storeにはまだ何もない。
    writeFileSync(commentsPath, JSON.stringify(legacyComments));
    expect(existsSync(commentsPath)).toBe(true);

    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await page.locator('#btn-comments').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1, {
      timeout: 3000,
    });
    await expect(
      page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
    ).toContainText('legacy migration test comment');

    // レガシーは削除され、新storeへエンベロープ形式で移行されている
    await expect.poll(() => existsSync(commentsPath)).toBe(false);
    await expect.poll(() => existsSync(reviewCommentsPath)).toBe(true);
    const envelope = JSON.parse(readFileSync(reviewCommentsPath, 'utf-8'));
    expect(envelope.version).toBe(2);
    expect(envelope.comments).toHaveLength(1);
    expect(envelope.comments[0].text).toBe('legacy migration test comment');
  });

  test('レガシー <file>.checkpoint を事前に置いて開くと diff が復元され・レガシーが削除され・新storeへ移行される', async ({
    page,
    fixturePath,
    legacyCheckpointPath,
    reviewCheckpointPath,
  }) => {
    // レガシー checkpoint = 変更前の全文。移行前なので新storeにはまだ何もない。
    writeFileSync(legacyCheckpointPath, ORIGINAL);
    expect(existsSync(legacyCheckpointPath)).toBe(true);

    // checkpoint 設定後に1行変更された状態を再現する
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', 'Some MIGRATED here.'),
    );

    await page.goto('/');
    await expect(page.locator('#content')).toContainText(
      'Some MIGRATED here.',
      { timeout: 5000 },
    );

    // ページ読み込み時の /diff 呼び出しで自動移行され、チェックポイント
    // 「設定済み」表示が復元される（チェックポイント設定は ⋯ メニューの中）
    await openOverflowMenu(page);
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
      { timeout: 3000 },
    );

    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(
      page.locator('[data-testid="diff-cell-old"][data-line-type="delete"]'),
    ).toContainText('Some content here.');
    await expect(
      page.locator('[data-testid="diff-cell-new"][data-line-type="insert"]'),
    ).toContainText('Some MIGRATED here.');

    // レガシーは削除され、新storeへ全文テキストのまま移行されている
    await expect.poll(() => existsSync(legacyCheckpointPath)).toBe(false);
    await expect.poll(() => existsSync(reviewCheckpointPath)).toBe(true);
    expect(readFileSync(reviewCheckpointPath, 'utf-8')).toBe(ORIGINAL);
  });
});
