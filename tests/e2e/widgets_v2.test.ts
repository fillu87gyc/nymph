/**
 * ウィジェット第2弾。
 *
 * 既定位置を持たず「枠に置いたときだけ出る」ウィジェット（検索結果 / 最近・
 * ブックマーク / ミニマップ / 図 / タスク / リンク・画像 / 用語集 /
 * frontmatter / 差分サマリ / 文書統計）を、配置画面から枠に入れて確かめる。
 *
 * どのテストもワーカー専用の fixture を書き換えるため、beforeEach で内容を
 * 用意し、afterEach で元に戻す（`/e2e-patterns` の書き込みテストの作法）。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  closeSecondFile,
  closeWidgetArrange,
  dragWidget,
  expect,
  openOverflowMenu,
  openSecondFile,
  openWidgetArrange,
  type Page,
  test,
  waitForCommentsPanelSettled,
} from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

/** 隣のファイル（リンクの生死チェックで「実在する側」に使う）。 */
function neighborPath(fixturePath: string): string {
  return join(dirname(fixturePath), neighborName(fixturePath));
}

function neighborName(fixturePath: string): string {
  return basename(fixturePath).replace(/\.md$/, '-neighbor.md');
}

/**
 * 第2弾ウィジェットが拾う要素（frontmatter・リンク・タスク・図・検索語）を
 * ひととおり含む本文。行番号はテストのジャンプ先アサーションに使うので、
 * 並びを変えるときは各テストの行番号も直すこと。
 */
function fixtureContent(fixturePath: string): string {
  return [
    '---', // 1
    'title: ウィジェット検証', // 2
    'status: draft', // 3
    '---', // 4
    '', // 5
    '# Widget Fixture', // 6
    '', // 7
    `段落。[外部](https://example.com) と [隣](./${neighborName(fixturePath)}) と [切れ](./missing.md)。`, // 8
    '', // 9
    '![図](./missing.png)', // 10
    '', // 11
    '## タスク', // 12
    '', // 13
    '- [ ] 未完のタスク', // 14
    '- [x] 済んだタスク', // 15
    '', // 16
    '## 図', // 17
    '', // 18
    '```mermaid', // 19
    'graph TD; A-->B', // 20
    '```', // 21
    '', // 22
    '## 検索対象', // 23
    '', // 24
    'zephyr という語をここに置く。', // 25
    '',
  ].join('\n');
}

/** 配置画面を開いてウィジェットを左枠へ入れ、メイン画面へ戻る。 */
async function placeInLeft(page: Page, id: string): Promise<void> {
  await dragWidget(page, id, 'left');
  await closeWidgetArrange(page);
  await expect(page.getByTestId('widget-slot-left')).toBeVisible();
}

test.beforeEach(async ({ page, fixturePath, reviewDir }) => {
  rmSync(reviewDir, { recursive: true, force: true });
  writeFileSync(fixturePath, fixtureContent(fixturePath));
  writeFileSync(neighborPath(fixturePath), '# Neighbor\n');
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.afterEach(async ({ fixturePath, reviewDir }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(neighborPath(fixturePath), { force: true });
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('枠への出し入れ', () => {
  test('枠に置くと現れ、外すと画面から消える', async ({ page }) => {
    // 置くまではどこにも出ていない
    await expect(page.getByTestId('stats-widget')).toHaveCount(0);

    await placeInLeft(page, 'stats');
    await expect(
      page.getByTestId('widget-slot-left').getByTestId('stats-widget'),
    ).toBeVisible();

    // 「利用可能」へ戻すと（既定位置が無いので）画面から消える
    await dragWidget(page, 'stats', 'available');
    await closeWidgetArrange(page);
    await expect(page.getByTestId('stats-widget')).toHaveCount(0);
    await expect(page.getByTestId('widget-slot-left')).toBeHidden();
  });

  test('配置画面の「利用可能」に第2弾のウィジェットが並ぶ', async ({
    page,
  }) => {
    await openWidgetArrange(page);
    for (const id of ['search', 'minimap', 'tasks', 'links', 'stats']) {
      await expect(page.getByTestId(`widget-chip-${id}`)).toBeVisible();
    }
    // 既定位置を持たないものは「何が出るか」の説明を添える
    await expect(page.getByTestId('widget-chip-minimap')).toContainText(
      '文書全体の俯瞰',
    );
  });

  test('リロードしても枠に置いたままになる', async ({ page }) => {
    await placeInLeft(page, 'tasks');
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('tasks-widget')).toBeVisible();
  });

  test('2 つ積むと上から順に並ぶ', async ({ page }) => {
    await placeInLeft(page, 'stats');
    await placeInLeft(page, 'tasks');
    const widgets = await page
      .getByTestId('widget-slot-left')
      .locator('[data-widget]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-widget')));
    // 既定の左枠にはエクスプローラーが居るが、ルート未指定で表示されないため
    // 実際に出るのは置いた 2 つだけ
    expect(widgets).toEqual(['stats', 'tasks']);
  });
});

test.describe('タスクウィジェット', () => {
  test('チェックボックスを一覧にし、選ぶとその行へ飛ぶ', async ({ page }) => {
    await placeInLeft(page, 'tasks');
    const items = page.getByTestId('tasks-widget-item');
    await expect(items).toHaveCount(2);
    await expect(page.getByTestId('tasks-widget-meta')).toHaveText('1 / 2');

    await items.first().click();
    await expect(
      page.locator('#content [data-block][data-line-start="14"]'),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
  });

  test('未完のみに絞り込める', async ({ page }) => {
    await placeInLeft(page, 'tasks');
    await page.getByTestId('tasks-widget-open-only').click();
    await expect(page.getByTestId('tasks-widget-item')).toHaveCount(1);
    await expect(page.getByTestId('tasks-widget-item')).toHaveAttribute(
      'data-done',
      'false',
    );
  });
});

test.describe('リンク / 画像ウィジェット', () => {
  test('相対リンクの生死を判定して並べる', async ({ page }) => {
    await placeInLeft(page, 'links');
    const items = page.getByTestId('links-widget-item');
    await expect(items).toHaveCount(4);

    // 外部リンクは生死を問わない（新しいタブで開くリンクを添える）
    await expect(items.nth(0)).toHaveAttribute('data-category', 'external');
    await expect(page.getByTestId('links-widget-open')).toHaveAttribute(
      'href',
      'https://example.com',
    );
    // 隣のファイルは実在、missing.md / missing.png は切れている
    await expect(items.nth(1)).toHaveAttribute('data-exists', 'true', {
      timeout: 3000,
    });
    await expect(items.nth(2)).toHaveAttribute('data-exists', 'false');
    await expect(items.nth(3)).toHaveAttribute('data-exists', 'false');
    await expect(page.getByTestId('links-widget-meta')).toContainText('切れ 2');
  });

  test('選ぶとその行へ飛ぶ', async ({ page }) => {
    await placeInLeft(page, 'links');
    await page.getByTestId('links-widget-item').nth(3).click();
    await expect(
      page.locator('#content [data-block][data-line-start="10"]'),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
  });

  test('リンクが消えると一覧からも消える（ホットリロード）', async ({
    page,
    fixturePath,
  }) => {
    await placeInLeft(page, 'links');
    await expect(page.getByTestId('links-widget-item')).toHaveCount(4);
    writeFileSync(fixturePath, '# リンク無し\n');
    await expect(page.getByTestId('links-widget')).toContainText(
      'リンクも画像もありません',
      { timeout: 5000 },
    );
  });
});

test.describe('図 / frontmatter / 文書統計ウィジェット', () => {
  test('図の一覧から Mermaid ブロックへ飛べる', async ({ page }) => {
    await placeInLeft(page, 'diagrams');
    const item = page.getByTestId('diagrams-widget-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('graph');
    await item.click();
    await expect(
      page.locator('#content [data-block][data-line-start="19"]'),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
  });

  test('frontmatter のキーと値を並べる', async ({ page }) => {
    await placeInLeft(page, 'frontmatter');
    await expect(page.getByTestId('frontmatter-key').first()).toHaveText(
      'title',
    );
    await expect(page.getByTestId('frontmatter-value').first()).toHaveText(
      'ウィジェット検証',
    );
  });

  test('文書統計が本文の内容を数える', async ({ page }) => {
    await placeInLeft(page, 'stats');
    const value = (key: string) =>
      page.locator(`[data-testid="stats-widget-value"][data-key="${key}"]`);
    await expect(value('見出し')).toHaveText('4');
    await expect(value('タスク')).toHaveText('1 / 2');
    await expect(value('リンク / 画像')).toHaveText('3 / 1');
  });

  test('本文が変わると統計も追従する（ホットリロード）', async ({
    page,
    fixturePath,
  }) => {
    await placeInLeft(page, 'stats');
    const headings = page.locator(
      '[data-testid="stats-widget-value"][data-key="見出し"]',
    );
    await expect(headings).toHaveText('4');
    writeFileSync(fixturePath, '# 1つだけ\n');
    await expect(headings).toHaveText('1', { timeout: 5000 });
  });
});

test.describe('ミニマップウィジェット', () => {
  test('文書全体の棒と、今見ている範囲の枠を出す', async ({ page }) => {
    await placeInLeft(page, 'minimap');
    await expect(page.getByTestId('minimap-canvas')).toBeVisible();
    await expect(
      page.getByTestId('minimap-canvas').locator('[data-kind]').first(),
    ).toBeVisible();
    await expect(page.getByTestId('minimap-viewport')).toBeVisible();
  });

  test('コメントの位置を点で重ねる', async ({ page }) => {
    await expect(page.getByTestId('minimap-marker')).toHaveCount(0);
    await placeInLeft(page, 'minimap');

    // コメントボタンを持つブロック（表 / 図）にコメントを 1 件付ける
    const block = page.locator('#content [data-block-type="mermaid"]').first();
    await block.hover();
    await block.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('ミニマップの点');
    await page.locator('#btn-submit').click();

    await expect(page.getByTestId('minimap-marker')).toHaveCount(1, {
      timeout: 5000,
    });

    // 点は棒と同じ座標系に乗る（19行目 / 全26行 ＝ 約 0.69 の位置）。棒 1 本の
    // 高さには上限があるので、枠ではなく棒の箱を基準にしないとここがずれる。
    // コメント追加で下ドックが開く（高さトランジション）ので、収まってから
    // 1 回の評価で両方の矩形を採る（別々に採ると途中の値が混ざる）。
    await waitForCommentsPanelSettled(page);
    const ratio = await page.evaluate(() => {
      const rows = document.querySelector('[data-testid="minimap-rows"]');
      const marker = document.querySelector('[data-testid="minimap-marker"]');
      if (!rows || !marker) return -1;
      const rb = rows.getBoundingClientRect();
      const mb = marker.getBoundingClientRect();
      return (mb.y + mb.height / 2 - rb.y) / rb.height;
    });
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });

  test('クリックした位置の行へ飛ぶ', async ({ page }) => {
    await placeInLeft(page, 'minimap');
    const canvas = page.getByTestId('minimap-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('minimap canvas has no box');
    await canvas.click({ position: { x: 4, y: box.height / 2 } });
    await expect(
      page.locator('#content [data-highlighted="true"]'),
    ).toHaveCount(1, { timeout: 3000 });
  });
});

test.describe('検索結果ウィジェット', () => {
  test('入力した語の一致を並べ、選ぶとその行へ飛ぶ', async ({ page }) => {
    await placeInLeft(page, 'search');
    await page.getByTestId('search-widget-input').fill('zephyr');
    const match = page.getByTestId('search-widget-match');
    await expect(match).toHaveCount(1, { timeout: 5000 });
    await match.click();
    await expect(
      page.locator('#content [data-block][data-line-start="25"]'),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
  });

  test('1文字では検索しない', async ({ page }) => {
    await placeInLeft(page, 'search');
    await page.getByTestId('search-widget-input').fill('z');
    await expect(page.getByTestId('search-widget')).toContainText(
      '2文字以上で検索します',
    );
    await expect(page.getByTestId('search-widget-match')).toHaveCount(0);
  });
});

test.describe('最近 / ブックマークウィジェット', () => {
  test('ブックマークしたファイルを開ける', async ({ page, fixturePath }) => {
    const second = await openSecondFile(page, fixturePath);
    try {
      await placeInLeft(page, 'recent');
      const bookmark = page
        .getByTestId('recent-widget-bookmark')
        .filter({ hasText: second.name });
      await expect(bookmark).toHaveCount(1);
      await bookmark.click();
      await expect(page.locator('#content')).toContainText('Second', {
        timeout: 5000,
      });
    } finally {
      await closeSecondFile(page, second.path);
    }
  });
});

test.describe('差分サマリウィジェット', () => {
  test('チェックポイント前は設定を促す', async ({ page }) => {
    await placeInLeft(page, 'diffsummary');
    await expect(page.getByTestId('diffsummary-widget')).toContainText(
      'チェックポイントを設定すると',
    );
  });

  test('変更のかたまりを並べ、選ぶと差分チェックモードへ入る', async ({
    page,
    fixturePath,
  }) => {
    await placeInLeft(page, 'diffsummary');
    await openOverflowMenu(page);
    await page.locator('#btn-checkpoint').click();
    await openOverflowMenu(page);
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );

    writeFileSync(
      fixturePath,
      fixtureContent(fixturePath).replace(
        'zephyr という語をここに置く。',
        'zephyr という語を書き換えた。',
      ),
    );
    await expect(page.locator('#content')).toContainText('書き換えた', {
      timeout: 5000,
    });

    const item = page.getByTestId('diffsummary-widget-item');
    await expect(item).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByTestId('diffsummary-widget-meta')).toContainText(
      '+1',
    );
    await item.click();
    await expect(page.getByTestId('diff-view')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('用語集ウィジェット', () => {
  const DICT = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        term: 'zephyr',
        aliases: [],
        definition: '西風。検索とジャンプの目印に使う語。',
        definitionHtml: '<p>西風。</p>',
        source: 'test',
        sourceRef: '',
      },
      {
        term: 'unused',
        aliases: [],
        definition: '本文には出てこない用語。',
        definitionHtml: '<p>本文には出てこない用語。</p>',
        source: 'test',
        sourceRef: '',
      },
    ],
  };

  test.beforeAll(({ dictDir, dictPath }) => {
    mkdirSync(dictDir, { recursive: true });
    writeFileSync(dictPath, JSON.stringify(DICT, null, 2));
  });

  test.afterAll(({ dictPath }) => {
    rmSync(dictPath, { force: true });
  });

  test('辞書の用語を並べ、本文の出現箇所へ飛ぶ', async ({ page }) => {
    await placeInLeft(page, 'terms');
    const items = page.getByTestId('terms-widget-item');
    await expect(items).toHaveCount(2, { timeout: 5000 });
    // 本文に出てこない用語は押せない
    await expect(items.nth(1)).toBeDisabled();

    await items.nth(0).click();
    await expect(
      page.locator('#content [data-block][data-line-start="25"]'),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
  });

  test('用語を絞り込める', async ({ page }) => {
    await placeInLeft(page, 'terms');
    await expect(page.getByTestId('terms-widget-item')).toHaveCount(2, {
      timeout: 5000,
    });
    await page.getByTestId('terms-widget-filter').fill('unused');
    await expect(page.getByTestId('terms-widget-item')).toHaveCount(1);
  });
});
