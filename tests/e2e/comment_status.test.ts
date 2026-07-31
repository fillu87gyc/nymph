import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

// 表ブロック（sample.md の 5〜8 行目）を丸ごと消す。コメント対象の文章が
// 無くなるため、そのコメントは「削除済」になる。
const TABLE_RE = /\| Name \| Value \|[\s\S]*?\| bar {2}\| 2 {5}\|\n/;

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
}

function removeTable(fixturePath: string) {
  writeFileSync(fixturePath, ORIGINAL.replace(TABLE_RE, ''));
}

test.beforeEach(async ({ page, fixturePath, reviewDir }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(reviewDir, { recursive: true, force: true });
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.afterEach(async ({ fixturePath, reviewDir }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('コメントのステータス（未解決 / 削除済 / 解決済）', () => {
  test('対象の文章が削除されると未解決から削除済になる', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, 'ステータス確認');
    const item = page.locator('[data-testid="comment-item"]').first();
    await expect(item).toHaveAttribute('data-status', 'open');
    await expect(page.locator('[data-testid="c-status"]')).toHaveCount(0);

    removeTable(fixturePath);

    await expect(item).toHaveAttribute('data-status', 'deleted', {
      timeout: 8000,
    });
    await expect(item.locator('[data-testid="c-status"]')).toContainText(
      '削除済',
    );
  });

  test('削除済は未解決フィルタから外れ、削除済フィルタに現れる', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, 'フィルタ確認');
    removeTable(fixturePath);
    await expect(
      page.locator('[data-testid="comment-item"][data-status="deleted"]'),
    ).toBeVisible({ timeout: 8000 });

    await page.locator('[data-testid="filter-open"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);

    await page.locator('[data-testid="filter-deleted"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="c-text"]')).toContainText(
      'フィルタ確認',
    );

    // すべて では引き続き見える
    await page.locator('[data-testid="filter-all"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
  });

  test('解決済のコメントは対象が削除されても解決済のまま', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, '解決済のまま');
    await page.locator('[data-testid="c-resolve"]').first().click();
    const item = page.locator('[data-testid="comment-item"]').first();
    await expect(item).toHaveAttribute('data-status', 'resolved');

    removeTable(fixturePath);
    // 本文から表が消えても解決済のまま（削除済にはならない）
    await expect(page.locator('#content')).not.toContainText('| Name |', {
      timeout: 8000,
    });
    await expect(item).toHaveAttribute('data-status', 'resolved');
    await expect(item.locator('[data-testid="c-status"]')).toContainText(
      '解決済',
    );

    await page.locator('[data-testid="filter-deleted"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
    await page.locator('[data-testid="filter-resolved"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
  });

  test('ツールバーの未解決件数から削除済は除かれる', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, 'カウント確認');
    await expect(page.locator('#comment-count')).toContainText('1');

    removeTable(fixturePath);
    await expect(
      page.locator('[data-testid="comment-item"][data-status="deleted"]'),
    ).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#comment-count')).toHaveCount(0);
  });
});

test.describe('もとの文章スナップショットの吹き出し', () => {
  test('削除済バッジのクリックで削除前の文章が前後 5 行つきで表示される', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, 'スナップショット確認');
    removeTable(fixturePath);
    await expect(
      page.locator('[data-testid="comment-item"][data-status="deleted"]'),
    ).toBeVisible({ timeout: 8000 });
    // 本文からは表が消えている
    await expect(page.locator('#content')).not.toContainText('| Name |');

    await expect(page.locator('[data-testid="snapshot-balloon"]')).toHaveCount(
      0,
    );
    await page.locator('[data-testid="c-status"]').click();

    const balloon = page.locator('[data-testid="snapshot-balloon"]');
    await expect(balloon).toBeVisible();
    // 消えた対象の文章（表）が吹き出しに残っている
    await expect(balloon).toContainText('Name');
    await expect(balloon).toContainText('bar');
    // 前後の文脈も見える
    await expect(balloon).toContainText('# Sample');
    await expect(balloon).toContainText('Some content here.');
    // 対象行（表の 4 行）だけがハイライトされる
    await expect(
      balloon.locator('[data-testid="snapshot-line-target"]'),
    ).toHaveCount(4);

    mkdirSync('playwright-screenshots', { recursive: true });
    await page.screenshot({
      path: 'playwright-screenshots/comment-snapshot-balloon.png',
    });

    // 再クリックで閉じる
    await page.locator('[data-testid="c-status"]').click();
    await expect(balloon).toHaveCount(0);
  });

  test('Escape と ✕ で吹き出しを閉じられる', async ({ page, fixturePath }) => {
    await addTableComment(page, '閉じる確認');
    removeTable(fixturePath);
    await expect(
      page.locator('[data-testid="comment-item"][data-status="deleted"]'),
    ).toBeVisible({ timeout: 8000 });

    await page.locator('[data-testid="c-status"]').click();
    await expect(
      page.locator('[data-testid="snapshot-balloon"]'),
    ).toBeVisible();
    await page.locator('[data-testid="snapshot-close"]').click();
    await expect(page.locator('[data-testid="snapshot-balloon"]')).toHaveCount(
      0,
    );

    await page.locator('[data-testid="c-status"]').click();
    await expect(
      page.locator('[data-testid="snapshot-balloon"]'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="snapshot-balloon"]')).toHaveCount(
      0,
    );
  });

  test('解決済コメントでも吹き出しでもとの文章を確認できる', async ({
    page,
  }) => {
    await addTableComment(page, '解決済スナップショット');
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-status="resolved"]'),
    ).toBeVisible();

    await page.locator('[data-testid="c-status"]').click();
    const balloon = page.locator('[data-testid="snapshot-balloon"]');
    await expect(balloon).toBeVisible();
    await expect(balloon).toContainText('Name');
    await expect(balloon).toContainText('# Sample');
  });

  test('Edit フック（/edit-op）の行番号リマップに吹き出しの行番号も追従する', async ({
    page,
    fixturePath,
  }) => {
    await addTableComment(page, 'リマップ確認');
    // 表は 5〜8 行目。解決済にしてバッジ（＝吹き出しの入口）を出す。
    const item = page.locator('[data-testid="comment-item"]').first();
    await expect(item).toContainText('L5–8');
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(item).toHaveAttribute('data-status', 'resolved');

    // Claude Code の Edit フックと同じ経路で、コメントより前に 2 行挿入する。
    // /edit-op はサーバーのキャッシュ本文を基準に判定するため先に POST し、
    // 実ファイルの書き換え（= SSE による再取得）を後に行う。
    const oldString = '# Sample\n';
    const newString = '# Sample\n\n追加された行\n';
    await page.request.post('/edit-op', {
      data: { tool_input: { old_string: oldString, new_string: newString } },
    });
    writeFileSync(fixturePath, ORIGINAL.replace(oldString, newString));

    // コメント自身の行表示が 2 行ぶんずれる
    await expect(item).toContainText('L7–10', { timeout: 8000 });

    // 吹き出しの行番号も同じだけずれて、本文の現在の行番号と一致する
    await page.locator('[data-testid="c-status"]').click();
    const balloon = page.locator('[data-testid="snapshot-balloon"]');
    await expect(balloon).toBeVisible();
    const targets = balloon.locator('[data-testid="snapshot-line-target"]');
    await expect(targets).toHaveCount(4);
    await expect(targets.first()).toHaveAttribute('data-line', '7');
    await expect(targets.last()).toHaveAttribute('data-line', '10');
    // 中身（もとの文章）は書き換わらない
    await expect(targets.first()).toContainText('Name');
  });

  test('スナップショットは保存され、リロード後も参照できる', async ({
    page,
    fixturePath,
    reviewCommentsPath,
  }) => {
    await addTableComment(page, '永続化確認');

    await expect
      .poll(
        () => {
          try {
            const envelope = JSON.parse(
              readFileSync(reviewCommentsPath, 'utf-8'),
            );
            return envelope.comments[0]?.snapshot?.target?.length ?? 0;
          } catch {
            return 0;
          }
        },
        { timeout: 5000 },
      )
      .toBe(4);

    const envelope = JSON.parse(readFileSync(reviewCommentsPath, 'utf-8'));
    const snapshot = envelope.comments[0].snapshot;
    expect(snapshot.startLine).toBe(5);
    expect(snapshot.before).toContain('# Sample');
    expect(snapshot.target[0]).toContain('| Name | Value |');
    expect(snapshot.after).toContain('## Section');

    // 対象を消してリロードしても、保存済みスナップショットから復元できる
    removeTable(fixturePath);
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('[data-testid="comment-item"][data-status="deleted"]'),
    ).toBeVisible({ timeout: 8000 });
    await page.locator('[data-testid="c-status"]').click();
    await expect(
      page.locator('[data-testid="snapshot-balloon"]'),
    ).toContainText('Name');
  });
});
