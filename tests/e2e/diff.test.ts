import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

// checkpoint → 1 行を編集 → 差分チェックモード ON、までを行う共通ヘルパ。
// 'Some content here.' の中央の語だけを置換し、前後（'Some '/' here.'）を
// 共通部分として残すことで、削除(−)・追加(+)両側に文字ハイライトが出る。
async function enableDiffWithChange(
  page: Page,
  fixturePath: string,
  replacement = 'Some XYZ here.',
) {
  await page.locator('#btn-checkpoint').click();
  await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
    'data-has-checkpoint',
    'true',
  );
  writeFileSync(
    fixturePath,
    ORIGINAL.replace('Some content here.', replacement),
  );
  await expect(page.locator('#content')).toContainText(replacement, {
    timeout: 5000,
  });
  await page.locator('#btn-diff').click();
  await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
    timeout: 3000,
  });
}

// 差分チェックモードで変更行（新側）にコメントを付ける
async function addDiffComment(page: Page, text: string) {
  const cell = page
    .locator('[data-testid="diff-cell-new"][data-line-type="insert"]')
    .first();
  await cell.hover();
  await cell.locator('[data-testid="diff-comment-btn"]').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({ timeout: 3000 });
}

test.beforeEach(
  async ({
    page,
    fixturePath,
    commentsPath,
    legacyCheckpointPath,
    reviewDir,
  }) => {
    // レガシーサイドカーの削除は移行テストの残骸掃除として残す
    rmSync(commentsPath, { force: true });
    rmSync(legacyCheckpointPath, { force: true });
    // 新store（コメント・チェックポイントとも）はテスト間で残留するため、
    // ワーカー内の他テストと分離できるようここでまとめて掃除する
    rmSync(reviewDir, { recursive: true, force: true });
    writeFileSync(fixturePath, ORIGINAL);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });
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

test.describe('チェックポイント', () => {
  test('チェックポイントボタンでチェックポイント状態になる', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );
  });

  test('チェックポイント設定後にトーストが表示される', async ({ page }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#toast')).toContainText('チェックポイント', {
      timeout: 3000,
    });
  });

  test('チェックポイント設定でボタンの配色が変わる（has-checkpoint スタイル）', async ({
    page,
  }) => {
    const btn = page.locator('#btn-checkpoint');
    // var(--accent) の実 RGB をプローブ要素で取得（テーマ依存のため固定値にしない）
    const accentRgb = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.borderColor = 'var(--accent)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).borderColor;
      probe.remove();
      return c;
    });
    await btn.click();
    await expect(btn).toHaveAttribute('data-has-checkpoint', 'true');
    // hover の border-color 変化と切り分けるためマウスをボタンから離す。
    // その上で枠線が「実際にアクセント色」になっていることを検証する
    // （hover で色が変わるだけの偽陽性を防ぐ）。
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => btn.evaluate((el) => getComputedStyle(el).borderColor))
      .toBe(accentRgb);
  });

  test('チェックポイントはファイルに永続化され、リロード後も復元される', async ({
    page,
    reviewCheckpointPath,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );
    // 保存先は新store（レビュー対象ファイルの隣ではない）
    expect(existsSync(reviewCheckpointPath)).toBe(true);

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
      { timeout: 3000 },
    );
  });

  test('リロード後も diff が表示できる（checkpoint 永続化）', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await page.locator('#btn-diff').click();
    await expect(
      page.locator('[data-testid="diff-cell-new"][data-line-type="insert"]'),
    ).toHaveCount(1, { timeout: 3000 });
  });
});

test.describe('差分チェックモード', () => {
  test('ON にすると本文が隠れて全画面の diff ビューが表示される', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'true',
    );
    // 通常モードの本文は表示されない
    await expect(page.locator('#content')).toHaveCount(0);

    // 左右余白なし = diff ビューがビューポートの幅いっぱいに広がる
    const viewBox = await page
      .locator('[data-testid="diff-view"]')
      .boundingBox();
    if (!viewBox) throw new Error('bounding box が取得できません');
    expect(viewBox.x).toBeLessThanOrEqual(1);
    expect(viewBox.width).toBeGreaterThanOrEqual(1280 - 20);
  });

  test('split 表示: 削除行は左（チェックポイント）・追加行は右（現在）に出る', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    const delCell = page.locator(
      '[data-testid="diff-cell-old"][data-line-type="delete"]',
    );
    const insCell = page.locator(
      '[data-testid="diff-cell-new"][data-line-type="insert"]',
    );
    await expect(delCell).toHaveCount(1);
    await expect(insCell).toHaveCount(1);
    await expect(delCell).toContainText('Some content here.');
    await expect(insCell).toContainText('Some XYZ here.');

    // 同じ行にペアリングされ（左が右より左にあり）、縦にずれない
    const delBox = await delCell.boundingBox();
    const insBox = await insCell.boundingBox();
    if (!delBox || !insBox) throw new Error('bounding box が取得できません');
    expect(delBox.x + delBox.width).toBeLessThanOrEqual(insBox.x + 1);
    expect(Math.abs(delBox.y - insBox.y)).toBeLessThan(2);

    mkdirSync('playwright-screenshots', { recursive: true });
    await page.screenshot({
      path: 'playwright-screenshots/diff-split-view.png',
    });
  });

  test('1:1 の変更は変更箇所だけ文字単位でハイライトされる', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    await expect(page.locator('[data-testid="diff-char-del"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="diff-char-ins"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="diff-char-del"]')).toHaveText(
      'content',
    );
    await expect(page.locator('[data-testid="diff-char-ins"]')).toHaveText(
      'XYZ',
    );
  });

  test('複数行にわたる変更（箇条書きの追加）も行ごとに表示される', async ({
    page,
    fixturePath,
  }) => {
    const before = '# Multi\n\n- ようこそ\n- ここは岐阜県です\n';
    const after =
      '# Multi\n\n- ようこそ\n- ここは\n- 水と山が綺麗な\n- 東海道新幹線が通る\n- 静岡県です\n';
    writeFileSync(fixturePath, before);
    await page.goto('/');
    await expect(page.locator('#content')).toContainText('ここは岐阜県です', {
      timeout: 5000,
    });

    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );

    writeFileSync(fixturePath, after);
    await expect(page.locator('#content')).toContainText('東海道新幹線が通る', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 3000,
    });

    // 削除 1 行・追加 4 行
    await expect(
      page.locator('[data-testid="diff-cell-old"][data-line-type="delete"]'),
    ).toHaveCount(1);
    const insCells = page.locator(
      '[data-testid="diff-cell-new"][data-line-type="insert"]',
    );
    await expect(insCells).toHaveCount(4);

    // 追加 4 行は y 座標が単調増加 = 縦に積まれている
    const tops = await insCells.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().top),
    );
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
  });

  test('長い行は横スクロールではなく折り返して表示される', async ({
    page,
    fixturePath,
  }) => {
    const longLine = `これは非常に長い段落で、Markdown ソースでは 1 行になっている。${'画面幅の半分に収まらないほど長いテキストが続く。'.repeat(10)}`;
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', longLine),
    );
    await expect(page.locator('#content')).toContainText('これは非常に長い', {
      timeout: 5000,
    });
    await page.locator('#btn-diff').click();
    const view = page.locator('[data-testid="diff-view"]');
    await expect(view).toBeVisible({ timeout: 3000 });

    // 横スクロールが発生していない
    const { scrollWidth, clientWidth } = await view.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // 追加行が複数行に折り返されている（セルの高さが 1 行分を大きく超える）
    const cellBox = await page
      .locator('[data-testid="diff-cell-new"][data-line-type="insert"]')
      .first()
      .boundingBox();
    if (!cellBox) throw new Error('bounding box が取得できません');
    const lineHeight = 13 * 1.6; // font-size 13px × line-height 1.6
    expect(cellBox.height).toBeGreaterThan(lineHeight * 2);
  });

  test('OFF にすると通常モード（本文表示）に戻る', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'false',
    );
    await expect(page.locator('[data-testid="diff-view"]')).toHaveCount(0);
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible();
  });

  test('チェックポイントなしで ON にすると案内メッセージが表示される', async ({
    page,
  }) => {
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-empty"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="diff-empty"]')).toContainText(
      'チェックポイント',
    );
  });

  test('ファイルを変更していない場合は変更行が表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );
    await page.locator('#btn-diff').click();
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(
      page.locator('[data-line-type="delete"], [data-line-type="insert"]'),
    ).toHaveCount(0);
  });
});

test.describe('差分への指摘（diff コメント）', () => {
  test('変更行の ＋ からコメントを追加でき、comments.json に diff 種別で保存される', async ({
    page,
    fixturePath,
    reviewCommentsPath,
  }) => {
    await enableDiffWithChange(page, fixturePath);
    await addDiffComment(page, 'この変更は意図的？');

    // 保存先は新store（reviewStore.ts のエンベロープ形式）
    await expect
      .poll(() => existsSync(reviewCommentsPath), { timeout: 3000 })
      .toBe(true);
    const envelope = JSON.parse(readFileSync(reviewCommentsPath, 'utf-8')) as {
      comments: Array<{
        block_type: string;
        text: string;
        context: {
          side: string;
          newLine: number | null;
          line: string;
          hunk: string[];
        };
      }>;
    };
    const saved = envelope.comments;
    expect(saved).toHaveLength(1);
    expect(saved[0].block_type).toBe('diff');
    expect(saved[0].text).toBe('この変更は意図的？');
    expect(saved[0].context.side).toBe('new');
    expect(saved[0].context.line).toBe('Some XYZ here.');
    // hunk スナップショット（対象行 + 前後）が自己完結で保存される
    expect(saved[0].context.hunk).toContain('Some XYZ here.');
    expect(saved[0].context.hunk.length).toBeGreaterThan(1);
  });

  test('コメントパネルに「差分への指摘」バッジと新旧行番号が表示される', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);
    await addDiffComment(page, 'バッジ確認');

    const item = page.locator('[data-testid="comment-item"]').first();
    await expect(item.locator('[data-testid="c-diff-badge"]')).toHaveText(
      '差分への指摘',
    );
    await expect(item).toContainText('新L');
    await expect(item.locator('[data-testid="c-ctx"]')).toContainText(
      'Some XYZ here.',
    );
  });

  test('コメント済みの行にはアンカーが表示され、クリックで内容がポップアップする', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);
    await addDiffComment(page, 'アンカー確認');

    const anchor = page.locator('[data-testid="diff-comment-anchor"]');
    await expect(anchor).toBeVisible({ timeout: 3000 });
    await anchor.click();
    await expect(page.locator('[data-testid="acp-text"]')).toHaveText(
      'アンカー確認',
    );

    mkdirSync('playwright-screenshots', { recursive: true });
    await page.screenshot({
      path: 'playwright-screenshots/diff-comment-anchor.png',
    });
  });

  test('通常モードからパネルの差分コメントをクリックすると差分チェックモードが開き該当行がハイライトされる', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);
    await addDiffComment(page, 'ジャンプ確認');

    // 通常モードへ戻る（パネルは開いたまま）
    await page.locator('#btn-diff').click();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible();

    await page.locator('[data-testid="comment-item"]').first().click();

    // 差分チェックモードへ切り替わり、該当行（追加行）が flash ハイライトされる。
    // flash は 1400ms で消えるため、ハイライトの検証を最初に行う
    const insCell = page.locator(
      '[data-testid="diff-cell-new"][data-line-type="insert"]',
    );
    await expect(insCell).toHaveAttribute('data-highlighted', 'true', {
      timeout: 3000,
    });
    await expect(insCell).toContainText('Some XYZ here.');
    await expect(page.locator('[data-testid="diff-view"]')).toBeVisible();
  });

  test('checkpoint を取り直して差分が消えたコメントには「削除済み」バッジが付く', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);
    await addDiffComment(page, '古くなる指摘');

    // 新しい checkpoint を設定 → 差分がなくなり、指摘先の行は diff に存在しなくなる…
    // が、行内容自体は現在ファイルに残っているため一致し続ける。
    // ここでは行内容そのものを変えて不一致にする。
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', 'まったく別の内容になった。'),
    );

    const item = page.locator('[data-testid="comment-item"]').first();
    await expect(item.locator('[data-testid="c-deleted"]')).toBeVisible({
      timeout: 5000,
    });
    // hunk スナップショットがあるのでコメント自体は表示され続ける
    await expect(item.locator('[data-testid="c-ctx"]')).toContainText(
      'Some XYZ here.',
    );
  });
});
