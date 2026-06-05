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

// checkpoint → 1 行を編集 → diff ON、までを行う共通ヘルパ。
// 'Some content here.' の中央の語だけを置換し、前後（'Some '/' here.'）を
// 共通部分として残すことで、削除(−)・追加(+)両側に文字ハイライトが出る。
async function enableDiffWithChange(
  page: Page,
  fixturePath: string,
  replacement = 'Some XYZ here.',
) {
  await page.setViewportSize({ width: 1280, height: 720 });
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
  await expect(page.locator('#btn-diff')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(
    page.locator('#content [data-diff-changed="true"]').first(),
  ).toBeVisible({
    timeout: 3000,
  });
}

test.beforeEach(async ({ page, fixturePath, commentsPath }) => {
  if (existsSync(commentsPath)) rmSync(commentsPath);
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
});

test.describe('diff 表示', () => {
  test('チェックポイント設定後にファイルを変更すると変更ブロックが表示される', async ({
    page,
    fixturePath,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );

    writeFileSync(
      fixturePath,
      ORIGINAL.replace(
        'Some content here.',
        'Modified content here.\nExtra new line.',
      ),
    );
    await expect(page.locator('#content')).toContainText('Modified content', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'true',
    );

    await expect(
      page.locator('#content [data-diff-changed="true"]').first(),
    ).toBeVisible({
      timeout: 3000,
    });
  });

  test('diff ON のとき変更ブロックに diff-side-ins / diff-side-del が表示される', async ({
    page,
    fixturePath,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
    );
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', 'Replaced content.'),
    );
    await expect(page.locator('#content')).toContainText('Replaced content', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(
      page.locator('#content [data-diff-changed="true"]').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    // At least one of ins or del side-panel must be present
    const sideCount = await page
      .locator('[data-testid="diff-side-del"], [data-testid="diff-side-ins"]')
      .count();
    expect(sideCount).toBeGreaterThan(0);

    mkdirSync('playwright-screenshots', { recursive: true });
    await page.screenshot({
      path: 'playwright-screenshots/diff-side-panels.png',
    });
  });

  test('diff ON のとき diff-side-ins に追加行テキストが含まれる', async ({
    page,
    fixturePath,
  }) => {
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', 'UNIQUE_INS_TEXT'),
    );
    await expect(page.locator('#content')).toContainText('UNIQUE_INS_TEXT', {
      timeout: 5000,
    });

    await page.locator('#btn-diff').click();
    await expect(
      page.locator('[data-testid="diff-side-ins"]').first(),
    ).toBeVisible({
      timeout: 3000,
    });
    await expect(
      page.locator('[data-testid="diff-side-ins"]').first(),
    ).toContainText('UNIQUE_INS_TEXT');
  });

  test('diff OFF にすると変更ブロックが消える', async ({
    page,
    fixturePath,
  }) => {
    await page.locator('#btn-checkpoint').click();
    writeFileSync(
      fixturePath,
      ORIGINAL.replace('Some content here.', 'Changed for diff off test.'),
    );
    await expect(page.locator('#content')).toContainText(
      'Changed for diff off test',
      { timeout: 5000 },
    );

    await page.locator('#btn-diff').click();
    await expect(
      page.locator('#content [data-diff-changed="true"]').first(),
    ).toBeVisible({
      timeout: 3000,
    });

    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'false',
    );
    await expect(
      page.locator('#content [data-diff-changed="true"]'),
    ).toHaveCount(0);
  });

  test('チェックポイントなしで diff ON にしても変更ブロックは表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-diff').click();
    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(
      page.locator('#content [data-diff-changed="true"]'),
    ).toHaveCount(0);
  });

  test('ファイルを変更していない場合は変更ブロックが表示されない', async ({
    page,
  }) => {
    await page.locator('#btn-checkpoint').click();
    await page.locator('#btn-diff').click();
    await expect(
      page.locator('#content [data-diff-changed="true"]'),
    ).toHaveCount(0);
  });
});

// ── diff の git 風レイアウト（右マージン配置・順序・縦割れ防止）───────────
test.describe('diff の右マージン表示', () => {
  test('diff は本文ブロックの右側（右マージン）に配置され、中央や下に出ない', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    const block = page
      .locator('#content [data-testid="md-block"][data-diff-changed="true"]')
      .first();
    const aside = block.locator('[data-testid="diff-aside"]');
    await expect(aside).toBeVisible();

    const blockBox = await block.boundingBox();
    const asideBox = await aside.boundingBox();
    if (!blockBox || !asideBox)
      throw new Error('bounding box が取得できません');
    // aside の左端が本文ブロックの右端以降にある = 右マージンに出ている
    expect(asideBox.x).toBeGreaterThanOrEqual(blockBox.x + blockBox.width - 1);
  });

  test('削除(−) が 追加(+) の上に積み重なる（git diff と同じ順序）', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    const del = page.locator('[data-testid="diff-side-del"]').first();
    const ins = page.locator('[data-testid="diff-side-ins"]').first();
    await expect(del).toBeVisible();
    await expect(ins).toBeVisible();

    const delBox = await del.boundingBox();
    const insBox = await ins.boundingBox();
    if (!delBox || !insBox) throw new Error('bounding box が取得できません');
    expect(delBox.y).toBeLessThan(insBox.y);
  });

  test('変更行は 1 行に収まり、変更箇所だけ文字単位でハイライトされる（縦割れ回帰防止）', async ({
    page,
    fixturePath,
  }) => {
    await enableDiffWithChange(page, fixturePath);

    const delLine = page.locator('[data-testid="diff-del"]').first();
    await expect(delLine).toBeVisible();

    // 旧バグ: 内側 span が display:block になり 1 行が縦に分割されていた。
    // client rect が 1 個 = 単一行に収まっていることを保証する。
    const rectCount = await delLine.evaluate(
      (el) => el.getClientRects().length,
    );
    expect(rectCount).toBe(1);

    // プレフィックス(−)を含め、変更前の行全体が保持されている
    await expect(delLine).toContainText('Some content here.');

    // 変更箇所のみ文字単位でハイライト（削除側・追加側それぞれ 1 箇所）
    await expect(page.locator('[data-testid="diff-char-del"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="diff-char-ins"]')).toHaveCount(1);
  });

  test('複数行にわたる変更（箇条書きの追加）も 1 行ずつ積み重なって表示される', async ({
    page,
    fixturePath,
  }) => {
    const before = '# Multi\n\n- ようこそ\n- ここは岐阜県です\n';
    const after =
      '# Multi\n\n- ようこそ\n- ここは\n- 水と山が綺麗な\n- 東海道新幹線が通る\n- 静岡県です\n';
    await page.setViewportSize({ width: 1400, height: 720 });
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
    await expect(page.locator('#btn-diff')).toHaveAttribute(
      'data-active',
      'true',
    );

    const aside = page.locator('[data-testid="diff-aside"]').first();
    await expect(aside).toBeVisible({ timeout: 3000 });

    // 削除 1 行・追加 4 行が、それぞれ個別の行として描画される
    await expect(
      aside.locator('[data-testid="diff-side-del"] [data-testid="diff-del"]'),
    ).toHaveCount(1);
    await expect(
      aside.locator('[data-testid="diff-side-ins"] [data-testid="diff-ins"]'),
    ).toHaveCount(4);

    // 行数が 1:N で対応が曖昧なため、追加 4 行すべて・削除 1 行すべてが
    // 全体ハイライトされる（「追加したのにハイライトされない」回帰防止）
    await expect(
      aside.locator(
        '[data-testid="diff-side-ins"] [data-testid="diff-char-ins"]',
      ),
    ).toHaveCount(4);
    await expect(
      aside.locator(
        '[data-testid="diff-side-del"] [data-testid="diff-char-del"]',
      ),
    ).toHaveCount(1);

    // 削除(−) ブロックが 追加(+) ブロックの上にある（git と同じ順序）
    const delBox = await aside
      .locator('[data-testid="diff-side-del"]')
      .boundingBox();
    const insBox = await aside
      .locator('[data-testid="diff-side-ins"]')
      .boundingBox();
    if (!delBox || !insBox) throw new Error('bounding box が取得できません');
    expect(delBox.y).toBeLessThan(insBox.y);

    // 追加 4 行は y 座標が単調増加 = 縦に積まれている（横並びや重なりではない）
    const tops = await aside
      .locator('[data-testid="diff-ins"]')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops).toHaveLength(4);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
  });
});
