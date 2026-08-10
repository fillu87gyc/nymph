import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openOverflowMenu, type Page, test } from './fixtures.ts';

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
  // switch-file で設定した droppedContent/droppedName はサーバー側に残り続ける
  // ため、明示的に破棄しないと同一 worker の後続テストに漏れて汚染する。
  await page.request
    .post('/close-file', { data: { path: '__dropped__' } })
    .catch(() => {});
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
  // コンテンツが 403 にならず表示されることを確認する。__dropped__ が唯一の
  // ファイルになるとタブ行は自動的に隠れる（2ファイル以上で表示される仕様の
  // ため）。「閉じるボタン」を使ったタブの close 操作自体は2ファイル以上の
  // シナリオで file_tabs.test.ts が検証する。
  test('元ファイルを閉じるとドロップファイルのコンテンツが表示され、タブ行は1件のため非表示になる', async ({
    page,
    fixturePath,
  }) => {
    // サーバーに dropped コンテンツを直接セット
    await page.request.post('/switch-file', {
      data: { content: '# Dropped Content\n', filename: 'dropped.md' },
    });

    // 元ファイルを閉じる（ページはまだリロードしない）
    await page.request.post('/close-file', { data: { path: fixturePath } });

    // ページをリロード → クライアントが /files を再取得し activeFile: '__dropped__' を得る
    await page.reload();

    // __dropped__ 1件だけなのでタブ行は表示されない
    await expect(page.locator('#file-tabs')).not.toBeVisible();

    // コンテンツが 403 にならずロードされる（"ファイルを読み込んでいます…" で止まらない）
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('ドロップで実際にファイル内容が切り替わる（実 drop イベント）', () => {
  // dragover/dragleave のオーバーレイ表示や /switch-file への直接 POST は
  // 上のテストで別途検証済みだが、DataTransfer に File を積んだ本物の
  // 'drop' イベントを発火して最後まで通す E2E がどこにも無かったため追加する。
  async function dropFile(
    page: Page,
    name: string,
    content: string,
  ): Promise<void> {
    const dataTransfer = await page.evaluateHandle(
      ({ name, content }: { name: string; content: string }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([content], name, { type: 'text/plain' }));
        return dt;
      },
      { name, content },
    );
    await page.dispatchEvent('#app', 'dragover', { dataTransfer });
    await page.dispatchEvent('#app', 'drop', { dataTransfer });
  }

  test('welcome 画面（ファイル未選択）で .md を drop すると内容が反映される', async ({
    page,
    fixturePath,
  }) => {
    // ファイル未選択の状態を作る（この worker には他にファイルが無いため
    // 唯一のファイルを閉じると welcome 画面になる）
    await page.request.post('/close-file', { data: { path: fixturePath } });
    await page.reload();
    await expect(page.locator('#file-tabs')).not.toBeVisible();

    await dropFile(page, 'dropped.md', '# Dropped Heading\n\nDropped body.\n');

    await expect(page.locator('#drop-overlay')).toHaveCount(0);
    await expect(page.locator('#content h1')).toContainText('Dropped Heading', {
      timeout: 3000,
    });
  });

  // ファイルを開いた状態でのドロップが「無視された」バグの回帰テスト。
  // ドロップ由来の擬似タブは実ファイルが開いていても必ずタブとして増え、
  // そのまま選択される（以前は実ファイルが1つでもあるとタブに現れず、
  // 画面がまったく変わらなかった）。
  test('ファイルを開いた状態で .md を drop するとタブが増えて内容が切り替わる', async ({
    page,
    fixturePath,
  }) => {
    // 既定の状態は fixture 1ファイルのみ（＝タブ行は非表示）
    await expect(page.locator('#file-tabs')).not.toBeVisible();

    await dropFile(page, 'dropped.md', '# Dropped Tab\n\nDropped body.\n');

    const droppedTab = page.locator('#file-tabs button', {
      hasText: 'dropped.md',
    });
    await expect(page.locator('#file-tabs')).toBeVisible({ timeout: 3000 });
    await expect(droppedTab).toHaveAttribute('data-active', 'true');
    await expect(page.locator('#content h1')).toContainText('Dropped Tab', {
      timeout: 3000,
    });

    // 元のファイルのタブへ戻れる（ドロップで置き換わったわけではない）
    const originalName = fixturePath.split('/').pop() ?? '';
    const originalTab = page.locator('#file-tabs button', {
      hasText: originalName,
    });
    await originalTab.click();
    await expect(page.locator('#content h1')).toContainText('Sample');

    // 擬似タブへも戻れる
    await droppedTab.click();
    await expect(page.locator('#content h1')).toContainText('Dropped Tab');

    // ドロップした2件目も同じくタブで開く（1件目と入れ替わる）
    await dropFile(page, 'dropped2.md', '# Second Drop\n\nSecond body.\n');
    await expect(
      page.locator('#file-tabs button', { hasText: 'dropped2.md' }),
    ).toHaveAttribute('data-active', 'true');
    await expect(page.locator('#content h1')).toContainText('Second Drop', {
      timeout: 3000,
    });

    // 擬似タブを閉じると元のファイルだけに戻る
    await page
      .locator('#file-tabs button', { hasText: 'dropped2.md' })
      .getByTestId('tab-close')
      .click();
    await expect(page.locator('#file-tabs')).not.toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Sample');
  });

  // 擬似タブを選択中はサーバー側の activeFile に直前の実ファイルが残る。
  // その実ファイルのコメントが擬似タブ側に出て（かつ保存先にされて）
  // しまわないことを確認する。
  test('擬似タブを選択中は元ファイルのコメントが混ざらない', async ({
    page,
    fixturePath,
  }) => {
    await page.request.post(
      `/comments?file=${encodeURIComponent(fixturePath)}`,
      {
        data: [
          {
            id: 'c_dropped_scope',
            lineStart: 1,
            lineEnd: 1,
            block_type: 'paragraph',
            context: 'Sample',
            text: '元ファイルのコメント',
          },
        ],
      },
    );
    await page.reload();
    await expect(page.locator('#comment-count')).toContainText('1');

    await dropFile(page, 'dropped.md', '# Dropped Tab\n\nDropped body.\n');

    await expect(page.locator('#content h1')).toContainText('Dropped Tab', {
      timeout: 3000,
    });
    await expect(page.locator('#comment-count')).toHaveCount(0);

    // 元ファイルのタブへ戻すとコメントも戻る（消えたわけではない）
    const originalName = fixturePath.split('/').pop() ?? '';
    await page.locator('#file-tabs button', { hasText: originalName }).click();
    await expect(page.locator('#comment-count')).toContainText('1');
  });

  test('.md 以外を drop すると内容は変わらずトーストで拒否される', async ({
    page,
  }) => {
    await dropFile(page, 'notes.txt', 'plain text');

    await expect(page.locator('#toast')).toContainText(
      'Markdownファイルをドロップしてください',
      { timeout: 3000 },
    );
    // 元のコンテンツのまま（拒否されて切り替わっていない）
    await expect(page.locator('#content h1')).toContainText('Sample');
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

  test('同じ文言のトーストを続けて出しても表示し直される', async ({ page }) => {
    const toast = page.locator('#toast');
    await page.locator('#btn-copy').click();
    await expect(toast).toContainText('コメントがありません', {
      timeout: 3000,
    });
    await expect(toast).toHaveCount(0, { timeout: 4000 });

    // 消えたあとに同じ操作をすると、同じ文言でももう一度出る
    await page.locator('#btn-copy').click();
    await expect(toast).toContainText('コメントがありません', {
      timeout: 3000,
    });
  });
});

test.describe('ファイルパスのコピー', () => {
  test('ツールバーのボタンで開いているファイルの絶対パスをコピーする', async ({
    page,
    context,
    fixturePath,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await openOverflowMenu(page);
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

    await openOverflowMenu(page);
    await expect(page.locator('#btn-copy-path')).toBeDisabled();
  });
});
