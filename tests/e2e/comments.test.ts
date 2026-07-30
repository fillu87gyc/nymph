import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  expect,
  openOverflowMenu,
  openSettingsMenu,
  type Page,
  test,
} from './fixtures.ts';

async function addComment(page: Page, text: string) {
  const tableBlock = page
    .locator('#content [data-testid="md-block"][data-block-type="table"]')
    .first();
  await tableBlock.hover();
  await tableBlock.locator('[data-testid="comment-btn"]').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({
    timeout: 3000,
  });
}

test.beforeEach(async ({ page, commentsPath, reviewDir }) => {
  if (existsSync(commentsPath)) rmSync(commentsPath);
  rmSync(reviewDir, { recursive: true, force: true });
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({
    timeout: 5000,
  });
});

test.afterEach(async ({ commentsPath, reviewDir }) => {
  try {
    rmSync(commentsPath);
  } catch {
    /* ignore */
  }
  rmSync(reviewDir, { recursive: true, force: true });
});

test.describe('コメントパネルの開閉', () => {
  test('コメントボタンでパネルが開く', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
  });

  test('✕ ボタンでパネルが閉じる', async ({ page }) => {
    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    await page.locator('#btn-close-panel').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).not.toBeVisible();
  });

  test('コメント追加後にパネルが自動で開く', async ({ page }) => {
    await addComment(page, 'auto open test');
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
  });
});

test.describe('コメントの削除', () => {
  test('削除ボタンでコメントが消える', async ({ page }) => {
    await addComment(page, 'delete me');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await page.locator('[data-testid="c-del"]').first().click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('削除後にコメントファイルから除去される', async ({
    page,
    reviewCommentsPath,
  }) => {
    await addComment(page, 'to delete');
    await page.locator('[data-testid="c-del"]').first().click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);
    // 保存先は新store（reviewStore.ts のエンベロープ形式）。
    // この時点までに追加(1件目)・削除(2件目)の2回 POST /comments が起きて
    // いるため、existsSync だけを poll すると1回目の書き込みで真になって
    // しまい、2回目(削除後)の保存が終わる前に読んでしまうレースがある。
    // ファイルの有無ではなく中身（件数）そのものを poll することで、
    // 「最終的に空配列になった」ことを直接待つ。
    await expect
      .poll(
        () => {
          if (!existsSync(reviewCommentsPath)) return null;
          return JSON.parse(readFileSync(reviewCommentsPath, 'utf-8')).comments
            .length;
        },
        { timeout: 3000 },
      )
      .toBe(0);
  });
});

test.describe('コメントの編集', () => {
  test('編集ボタンでモーダルが開き更新できる', async ({ page }) => {
    await addComment(page, 'original text');
    await page.locator('[data-testid="c-edit"]').first().click();
    await expect(page.locator('#comment-modal')).toBeVisible();
    await expect(page.locator('#btn-submit')).toContainText('更新');

    const ta = page.locator('#comment-ta');
    await ta.fill('updated text');
    await page.locator('#btn-submit').click();

    await expect(
      page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
    ).toContainText('updated text');
  });
});

test.describe('コメント窓の位置・操作性', () => {
  test('コメント窓は固定位置ではなく＋ボタンの直下に表示される', async ({
    page,
  }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    const btn = tableBlock.locator('[data-testid="comment-btn"]');
    const btnBox = await btn.boundingBox();
    if (!btnBox) throw new Error('comment-btn not found');
    await btn.click();

    const modalBox = await page.locator('#comment-modal').boundingBox();
    if (!modalBox) throw new Error('comment-modal not found');

    // 右上固定（top: 54px 付近）ではなく、クリックした＋ボタンの近く（下方）に出る
    expect(modalBox.y).toBeGreaterThan(btnBox.y);
    expect(Math.abs(modalBox.y - 54)).toBeGreaterThan(20);
  });

  test('コメント窓を表示していても背後のコンテンツをスクロールできる', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    const scrollArea = page.locator('[data-testid="content-scroll"]');
    const modalBox = await page.locator('#comment-modal').boundingBox();
    if (!modalBox) throw new Error('comment-modal not found');

    // モーダルに重ならない位置にマウスを置いてホイールスクロール
    const wheelX = modalBox.x > 100 ? 20 : 780;
    const before = await scrollArea.evaluate((el) => el.scrollTop);
    await page.mouse.move(wheelX, 380);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => scrollArea.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before);
  });

  test('ヘッダーをドラッグするとコメント窓を移動できる', async ({ page }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();

    const modal = page.locator('#comment-modal');
    const before = await modal.boundingBox();
    if (!before) throw new Error('comment-modal not found');

    const head = page.locator('#modal-line');
    const headBox = await head.boundingBox();
    if (!headBox) throw new Error('modal-line not found');

    const startX = headBox.x + headBox.width / 2;
    const startY = headBox.y + headBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 60, { steps: 10 });
    await page.mouse.up();

    const after = await modal.boundingBox();
    if (!after) throw new Error('comment-modal not found');
    expect(after.x).toBeCloseTo(before.x + 80, 0);
    expect(after.y).toBeCloseTo(before.y + 60, 0);
  });
});

test.describe('コメント削除モーダル', () => {
  test('ゴミ箱アイコン → モーダルが開く', async ({ page }) => {
    await addComment(page, 'comment 1');
    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();
  });

  test('孤立コメントなし: すべて削除がデフォルト選択', async ({ page }) => {
    await addComment(page, 'comment');
    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(
      page.locator('[data-testid="choice-all"] input[type="radio"]'),
    ).toBeChecked();
    await page.locator('#btn-confirm-cancel').click();
  });

  test('すべて削除 → コメントが全件消える', async ({ page }) => {
    await addComment(page, 'comment 1');
    await addComment(page, 'comment 2');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('[data-testid="choice-all"]').click();
    await page.locator('#btn-confirm-ok').click();

    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).not.toBeVisible();
    await page.locator('#btn-comments').click();
    await expect(page.locator('#no-comments')).toBeVisible();
  });

  test('キャンセルするとコメントが残る', async ({ page }) => {
    await addComment(page, 'keep me');
    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
  });

  test('孤立コメントあり: 削除済みのみがデフォルト選択・削除済みオプションが enabled', async ({
    page,
    fixturePath,
  }) => {
    await addComment(page, 'will be orphaned');
    const original = readFileSync(fixturePath, 'utf-8');
    const modified = original.replace(
      /\| Name \| Value \|[\s\S]*?\| bar {2}\| 2 {5}\|\n/,
      '',
    );
    writeFileSync(fixturePath, modified);
    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]').first(),
    ).toBeVisible({ timeout: 8000 });

    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await expect(
      page.locator('[data-testid="choice-orphaned"] input[type="radio"]'),
    ).toBeChecked();
    await expect(
      page.locator('[data-testid="choice-orphaned"] input[type="radio"]'),
    ).toBeEnabled();

    await page.locator('#btn-confirm-cancel').click();
    writeFileSync(fixturePath, original);
  });

  test('削除済みのみ削除できる', async ({ page, fixturePath }) => {
    await addComment(page, 'orphaned comment');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1, {
      timeout: 3000,
    });

    const original = readFileSync(fixturePath, 'utf-8');
    const modified = original.replace(
      /\| Name \| Value \|[\s\S]*?\| bar {2}\| 2 {5}\|\n/,
      '',
    );
    writeFileSync(fixturePath, modified);

    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]').first(),
    ).toBeVisible({ timeout: 8000 });

    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('[data-testid="choice-orphaned"]').click();
    await page.locator('#btn-confirm-ok').click();

    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0, {
      timeout: 3000,
    });
    await expect(page.locator('#no-comments')).toBeVisible();

    writeFileSync(fixturePath, original);
  });

  test('削除済みオプションでキャンセルするとコメントが残る', async ({
    page,
    fixturePath,
  }) => {
    await addComment(page, 'will stay');

    const original = readFileSync(fixturePath, 'utf-8');
    const modified = original.replace(
      /\| Name \| Value \|[\s\S]*?\| bar {2}\| 2 {5}\|\n/,
      '',
    );
    writeFileSync(fixturePath, modified);

    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]').first(),
    ).toBeVisible({ timeout: 8000 });

    await openOverflowMenu(page);
    await page.locator('#btn-clear-all').click();
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();

    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);

    writeFileSync(fixturePath, original);
  });
});

test.describe('コメントクリックでコンテンツハイライト', () => {
  test('コメントをクリックすると対応ブロックがハイライトされる', async ({
    page,
  }) => {
    await addComment(page, 'highlight test');

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const lineStart = await tableBlock.getAttribute('data-line-start');

    await page.locator('[data-testid="comment-item"]').first().click();

    await expect(
      page.locator(
        `#content [data-testid="md-block"][data-line-start="${lineStart}"]`,
      ),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });
  });

  test('ハイライトはしばらく後に消える', async ({ page }) => {
    await addComment(page, 'transient highlight');

    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const lineStart = await tableBlock.getAttribute('data-line-start');

    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator(
        `#content [data-testid="md-block"][data-line-start="${lineStart}"]`,
      ),
    ).toHaveAttribute('data-highlighted', 'true', { timeout: 1000 });

    // 1.4s アニメーション後に消える
    await expect(
      page.locator(
        `#content [data-testid="md-block"][data-line-start="${lineStart}"]`,
      ),
    ).toHaveAttribute('data-highlighted', 'false', { timeout: 2500 });
  });

  test('コメントクリック後に対応ブロックがビューポートに入る', async ({
    page,
  }) => {
    await addComment(page, 'scroll test');
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const lineStart = await tableBlock.getAttribute('data-line-start');
    await page.locator('[data-testid="comment-item"]').first().click();
    await expect(
      page.locator(
        `#content [data-testid="md-block"][data-line-start="${lineStart}"]`,
      ),
    ).toBeInViewport({ timeout: 2000 });
  });
});

test.describe('コメントパネルのリサイズ', () => {
  test('リサイズハンドルを上にドラッグするとパネルが高くなる', async ({
    page,
  }) => {
    await addComment(page, 'resize test');
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();

    const panel = page.locator('#comments-panel');
    const handle = page.locator('#panel-resize-handle');

    const initialHeight = await panel.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('resize handle not found');

    const cx = handleBox.x + handleBox.width / 2;
    const cy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 120, { steps: 10 });
    await page.mouse.up();

    const newHeight = await panel.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    expect(newHeight).toBeGreaterThan(initialHeight);
  });

  test('パネル高さが localStorage に保存される', async ({ page }) => {
    await addComment(page, 'height persist');
    // Wait for the 0.2s panel-open CSS transition to finish
    await page.waitForTimeout(300);

    const handle = page.locator('#panel-resize-handle');
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('resize handle not found');

    const cx = handleBox.x + handleBox.width / 2;
    const cy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 80, { steps: 8 });
    await page.mouse.up();

    // stopDrag saves offsetHeight synchronously, but React may not have
    // flushed the new height to the DOM yet — wait until it's set.
    await page.waitForFunction(
      () => localStorage.getItem('nymph-panel-height') !== null,
      { timeout: 2000 },
    );
    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-panel-height'),
    );
    expect(Number(saved)).toBeGreaterThan(0);
  });

  test('保存したパネル高さがリロード後に復元される', async ({ page }) => {
    // 既定(210)と十分に異なる高さを localStorage に保存しておく
    await page.evaluate(() =>
      localStorage.setItem('nymph-panel-height', '380'),
    );
    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    // open 用の height トランジション(0.2s)が終わるのを待つ
    await page.waitForTimeout(300);

    const height = await page
      .locator('#comments-panel')
      .evaluate((el) => (el as HTMLElement).offsetHeight);
    // 既定値(210)ではなく保存値(380)付近に復元されていること
    expect(height).toBeGreaterThan(300);
  });
});

test.describe('コメントボタンの表示（CSS hover）', () => {
  test('既定では非表示、ホバーで表示される', async ({ page }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    const btn = tableBlock.locator('[data-testid="comment-btn"]');

    // ホバー前は CSS で opacity:0（= 非表示）
    await expect(btn).toHaveCSS('opacity', '0');

    await tableBlock.hover();
    // ホバーで opacity:1 まで遷移する
    await expect(btn).toHaveCSS('opacity', '1');
  });

  test('コメントのあるブロックではホバーなしでも表示される', async ({
    page,
  }) => {
    await addComment(page, 'visible without hover');
    // パネルを閉じてブロックからマウスを離した状態にする
    await page.locator('#btn-close-panel').click();
    await page.mouse.move(0, 0);

    const btn = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first()
      .locator('[data-testid="comment-btn"]');
    await expect(btn).toHaveCSS('opacity', '1');
  });
});

test.describe('テーマ切替', () => {
  test('テーマボタンで light/dark が切り替わる', async ({ page }) => {
    const initial = await page.evaluate(
      () => document.documentElement.dataset.theme ?? 'dark',
    );
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    const next = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(next).not.toBe(initial);
  });

  test('テーマが localStorage に保存される', async ({ page }) => {
    await openSettingsMenu(page);
    await page.locator('#btn-theme').click();
    const saved = await page.evaluate(() =>
      localStorage.getItem('nymph-theme'),
    );
    expect(saved).not.toBeNull();
  });
});

test.describe('複数コメント', () => {
  test('コメントが lineStart 順に並ぶ', async ({ page }) => {
    await addComment(page, 'first comment');
    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('second comment');
    await page.locator('#btn-submit').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    const items = page.locator(
      '[data-testid="comment-item"] [data-testid="c-text"]',
    );
    await expect(items.first()).toContainText('first comment');
    await expect(items.nth(1)).toContainText('second comment');
  });

  test('コメント数がツールバーに表示される', async ({ page }) => {
    await addComment(page, 'count test');
    await expect(page.locator('#comment-count')).toContainText('1');
  });
});

test.describe('削除済みコメントの表示', () => {
  test('対象テキストが存在しない selection コメントに「削除済」バッジが表示される', async ({
    page,
    fixturePath,
    reviewDir,
    reviewCommentsPath,
  }) => {
    const orphanedComment = [
      {
        id: 1,
        lineStart: 3,
        lineEnd: 3,
        block_type: 'selection',
        context: '【NYMPH_TEST_ORPHAN_DOES_NOT_EXIST_XYZ_99999】',
        selection_offset: 0,
        text: '孤立コメント',
      },
    ];
    // 新store（reviewStore.ts のエンベロープ形式）に直接シードする
    mkdirSync(reviewDir, { recursive: true });
    writeFileSync(
      reviewCommentsPath,
      JSON.stringify({
        version: 2,
        file: fixturePath,
        updatedAt: new Date().toISOString(),
        comments: orphanedComment,
      }),
    );

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({
      timeout: 5000,
    });

    await page.locator('#btn-comments').click();
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]'),
    ).toBeVisible({
      timeout: 3000,
    });
    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]'),
    ).toContainText('削除済');
  });

  test('対象ブロックが存在する block コメントには「削除済」バッジが表示されない', async ({
    page,
  }) => {
    // UI 経由で block コメントを追加（lineStart/lineEnd が正しく設定され、ブロックが存在する）
    await addComment(page, '有効コメント');
    // useEffect の反映を待つ
    await page.waitForTimeout(600);
    await expect(
      page.locator('[data-testid="c-status"][data-status="deleted"]'),
    ).not.toBeVisible();
  });
});

test.describe('コメント入力中の外側クリック（入力破棄バグの回帰防止）', () => {
  test('入力済みの状態で本文をクリックしても破棄されず、そのまま送信できる', async ({
    page,
    reviewCommentsPath,
  }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    await page.locator('#comment-ta').fill('draft comment text');

    // モーダル外（本文の見出し）をクリックする。以前は無条件に onClose が
    // 呼ばれ入力中のテキストが消えていたが、入力済みなら閉じない仕様に修正済み。
    await page.locator('#content h1').first().click();

    await expect(page.locator('#comment-modal')).toBeVisible();
    await expect(page.locator('#comment-ta')).toHaveValue('draft comment text');

    await page.locator('#btn-submit').click();
    await expect(
      page.locator('[data-testid="comment-item"]').first(),
    ).toContainText('draft comment text');

    // 新store（reviewStore.ts のエンベロープ形式）が実際に作成され、保存されていること
    await expect.poll(() => existsSync(reviewCommentsPath)).toBe(true);
    const envelope = JSON.parse(readFileSync(reviewCommentsPath, 'utf-8'));
    expect(envelope.comments).toHaveLength(1);
    expect(envelope.comments[0].text).toBe('draft comment text');
  });

  test('未入力のまま本文をクリックするとモーダルは閉じる（従来通り）', async ({
    page,
  }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    await page.locator('#content h1').first().click();
    await expect(page.locator('#comment-modal')).not.toBeVisible();
  });

  test('Escape キーは入力済みでも閉じる（明示操作は従来通り）', async ({
    page,
  }) => {
    const tableBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="table"]')
      .first();
    await tableBlock.hover();
    await tableBlock.locator('[data-testid="comment-btn"]').click();
    await expect(page.locator('#comment-modal')).toBeVisible();

    await page.locator('#comment-ta').fill('will be discarded via escape');
    await page.locator('#comment-ta').press('Escape');
    await expect(page.locator('#comment-modal')).not.toBeVisible();
  });
});

test.describe('Phase 2: コメントのライフサイクル（resolved / フィルタ / round）', () => {
  test('解決 → Open フィルタで消え Resolved フィルタで見える → 再オープンで Open に戻る', async ({
    page,
  }) => {
    // addComment 後はパネルが自動で開く（デフォルトフィルタは All）
    await addComment(page, 'needs review');
    await expect(
      page.locator('#comments-panel[data-open="true"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);

    // 解決済みにする（All 表示中なので一覧からは消えない）
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toBeVisible();

    // Open フィルタでは消える
    await page.locator('[data-testid="filter-open"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);

    // Resolved フィルタでは見える
    await page.locator('[data-testid="filter-resolved"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="c-text"]')).toContainText(
      'needs review',
    );

    // 再オープン（Resolved 表示中に解除するので一覧から消える）
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);

    // Open フィルタで再び見える
    await page.locator('[data-testid="filter-open"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="false"]'),
    ).toBeVisible();
  });

  test('All フィルタは resolved の有無に関わらず全件表示する', async ({
    page,
  }) => {
    // addComment 後はパネルが自動で開く
    await addComment(page, 'first');
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toBeVisible();

    await page.locator('[data-testid="filter-all"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
  });

  test('ツールバーのバッジは Open（未解決）件数を示す', async ({ page }) => {
    await addComment(page, 'comment 1');
    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('comment 2');
    await page.locator('#btn-submit').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    // 全件未解決なので 2
    await expect(page.locator('#comment-count')).toContainText('2');

    // 1件解決すると Open 件数は 1 に減る
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toBeVisible();
    await expect(page.locator('#comment-count')).toContainText('1');
  });

  test('resolved はリロード後も永続する', async ({ page }) => {
    // addComment 後はパネルが自動で開く
    await addComment(page, 'persist me');
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await page.locator('#btn-comments').click();
    await page.locator('[data-testid="filter-resolved"]').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="c-text"]')).toContainText(
      'persist me',
    );
  });

  test('チェックポイント設定後に作成したコメントには R1 が表示される', async ({
    page,
  }) => {
    // チェックポイント設定前のコメントには round バッジが出ない
    await addComment(page, 'before checkpoint');
    await expect(page.locator('[data-testid="c-round"]')).toHaveCount(0);

    await openOverflowMenu(page);
    await page.locator('#btn-checkpoint').click();
    // 項目クリックでメニューは閉じるため、状態確認には開き直す。
    await openOverflowMenu(page);
    await expect(page.locator('#btn-checkpoint')).toHaveAttribute(
      'data-has-checkpoint',
      'true',
      { timeout: 5000 },
    );

    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill('after checkpoint');
    await page.locator('#btn-submit').click();
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    const newItem = page
      .locator('[data-testid="comment-item"]')
      .filter({ hasText: 'after checkpoint' });
    await expect(newItem.locator('[data-testid="c-round"]')).toHaveText('R1');
  });
});

test.describe('レビューのコピー（解決済みの除外）', () => {
  async function addCommentOnMermaid(page: Page, text: string) {
    const mermaidBlock = page
      .locator('#content [data-testid="md-block"][data-block-type="mermaid"]')
      .first();
    await mermaidBlock.hover();
    await mermaidBlock.locator('[data-testid="comment-btn"]').click();
    await page.locator('#comment-ta').fill(text);
    await page.locator('#btn-submit').click();
  }

  test('解決済みコメントはコピーされる JSON に含まれない', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await addComment(page, 'まだ直っていない');
    await addCommentOnMermaid(page, 'もう直した');
    await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(2);

    // 「もう直した」だけを解決済みにする
    await page
      .locator('[data-testid="comment-item"]')
      .filter({ hasText: 'もう直した' })
      .locator('[data-testid="c-resolve"]')
      .click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toHaveCount(1);

    await page.locator('#btn-copy').click();
    await expect(page.locator('#toast')).toContainText(
      'レビューをコピーしました',
      { timeout: 3000 },
    );

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const payload = JSON.parse(copied);
    expect(payload.comment_count).toBe(1);
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].id).toBe(1);
    expect(payload.comments[0].comment).toBe('まだ直っていない');
    expect(copied).not.toContain('もう直した');
  });

  test('全件解決済みならコピーせず通知トーストを出す', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));

    await addComment(page, '直った指摘');
    await page.locator('[data-testid="c-resolve"]').first().click();
    await expect(
      page.locator('[data-testid="comment-item"][data-resolved="true"]'),
    ).toHaveCount(1);

    await page.locator('#btn-copy').click();
    await expect(page.locator('#toast')).toContainText(
      '未解決のコメントがありません',
      { timeout: 3000 },
    );

    // クリップボードは書き換えられていない
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('sentinel');
  });
});
