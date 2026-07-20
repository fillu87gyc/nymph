import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  type Page,
  pollUntilReady,
  reviewCommentsPathFor,
  test,
} from './fixtures.ts';

// ディレクトリモード（nymph <dir>）の専用サーバーをワーカーごとに立てる。
// 標準ワーカーサーバー（6276+）と衝突しないポート帯を使う。
const TREE_BASE_PORT = 6450;

const GUIDE_ORIGINAL = `# Guide

ツリーから開いたファイル

| 列A | 列B |
| --- | --- |
| 1   | 2   |
`;

let proc: ChildProcess;
let port: number;
let treeDir: string;
let guidePath: string;

async function gotoTree(page: Page) {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#file-tree')).toBeVisible();
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  port = TREE_BASE_PORT + workerInfo.workerIndex;
  treeDir = join(
    process.cwd(),
    `tests/fixtures/treedir-w${workerInfo.workerIndex}`,
  );
  guidePath = join(treeDir, 'docs', 'guide.md');

  rmSync(treeDir, { recursive: true, force: true });
  mkdirSync(join(treeDir, 'docs'), { recursive: true });
  mkdirSync(join(treeDir, '.hidden'), { recursive: true });
  mkdirSync(join(treeDir, 'node_modules'), { recursive: true });
  writeFileSync(join(treeDir, 'README.md'), '# Tree Root\n');
  writeFileSync(guidePath, GUIDE_ORIGINAL);
  writeFileSync(join(treeDir, '.hidden', 'skip.md'), '# skip\n');
  writeFileSync(join(treeDir, 'node_modules', 'skip.md'), '# skip\n');

  proc = spawn('bun', ['src/cli.ts', '-p', String(port), treeDir], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: join(treeDir, '.dict'),
      XDG_DATA_HOME: join(treeDir, '.xdg'),
    },
    stdio: 'ignore',
  });
  await pollUntilReady(`http://localhost:${port}/`);
});

test.afterAll(async () => {
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((r) => proc.once('exit', r)),
    new Promise<void>((r) => setTimeout(r, 5000)),
  ]);
  rmSync(treeDir, { recursive: true, force: true });
});

test.describe('ディレクトリモード（ツリー表示）', () => {
  test('サイドバーに階層が表示され、隠しディレクトリ・node_modules は出ない', async ({
    page,
  }) => {
    await gotoTree(page);
    await expect(page.getByTestId('tree-root-name')).toContainText(
      `treedir-w${test.info().workerIndex}`,
    );
    await expect(
      page.getByTestId('tree-file').filter({ hasText: 'README.md' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('tree-dir').filter({ hasText: 'docs' }),
    ).toBeVisible();
    await expect(page.locator('#file-tree')).not.toContainText('.hidden');
    await expect(page.locator('#file-tree')).not.toContainText('node_modules');
  });

  test('初期状態はタブなしの welcome 画面', async ({ page }) => {
    await gotoTree(page);
    await expect(page.locator('#file-tabs')).not.toBeVisible();
    await expect(page.locator('#welcome-msg')).toContainText(
      'ツリーからファイルを選択してください',
    );
  });

  test('ツリーのファイルを開くとタブ追加・本文表示・ハイライトされ、折りたたみでもタブは残る', async ({
    page,
  }) => {
    await gotoTree(page);
    const guide = page.getByTestId('tree-file').filter({ hasText: 'guide.md' });
    await expect(guide).toBeVisible(); // dir は初期展開
    await guide.click();

    await expect(
      page.locator('#file-tabs button', { hasText: 'guide.md' }),
    ).toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Guide');
    await expect(guide).toHaveAttribute('data-active', 'true');

    // docs を折りたたむとツリーから消えるがタブは残る
    await page.getByTestId('tree-dir').filter({ hasText: 'docs' }).click();
    await expect(guide).not.toBeVisible();
    await expect(
      page.locator('#file-tabs button', { hasText: 'guide.md' }),
    ).toBeVisible();
    // 再展開
    await page.getByTestId('tree-dir').filter({ hasText: 'docs' }).click();
    await expect(guide).toBeVisible();
  });

  test('ツリーから開いたファイルもホットリロードされる', async ({ page }) => {
    await gotoTree(page);
    await page.getByTestId('tree-file').filter({ hasText: 'guide.md' }).click();
    await expect(page.locator('#content h1')).toContainText('Guide');

    writeFileSync(guidePath, '# Guide Updated\n');
    await expect(page.locator('#content h1')).toContainText('Guide Updated', {
      timeout: 5000,
    });
    writeFileSync(guidePath, GUIDE_ORIGINAL);
  });

  test('ツリーから開いたファイルへのコメントがリロード後も残る', async ({
    page,
  }) => {
    // 保存先は新store（reviewStore.ts）。legacy パスの掃除は移行テストの
    // 残骸掃除として残す。
    const legacyCommentsPath = `${guidePath}.comments.json`;
    const commentsPath = reviewCommentsPathFor(
      join(treeDir, '.xdg'),
      guidePath,
    );
    rmSync(legacyCommentsPath, { force: true });
    rmSync(commentsPath, { force: true });
    try {
      await gotoTree(page);
      await page
        .getByTestId('tree-file')
        .filter({ hasText: 'guide.md' })
        .click();
      await expect(page.locator('#content h1')).toContainText('Guide');

      const block = page
        .locator('#content [data-testid="md-block"][data-block-type="table"]')
        .first();
      await block.hover();
      await block.locator('[data-testid="comment-btn"]').click();
      await page.locator('#comment-ta').fill('ツリー経由のコメント');
      await page.locator('#btn-submit').click();
      await expect(
        page.locator('[data-testid="comment-item"]').first(),
      ).toBeVisible({ timeout: 3000 });

      await page.reload();
      await expect(page.locator('#file-tree')).toBeVisible();
      await page.locator('#btn-comments').click();
      await expect(
        page.locator('[data-testid="comment-item"]').first(),
      ).toContainText('ツリー経由のコメント');
    } finally {
      rmSync(commentsPath, { force: true });
    }
  });

  test('起動後に作られたファイルはリロードで出現する（毎回再スキャン）', async ({
    page,
  }) => {
    const newPath = join(treeDir, 'docs', 'new-file.md');
    try {
      await gotoTree(page);
      await expect(
        page.getByTestId('tree-file').filter({ hasText: 'new-file.md' }),
      ).not.toBeVisible();

      writeFileSync(newPath, '# New File\n');
      await page.reload();
      await expect(
        page.getByTestId('tree-file').filter({ hasText: 'new-file.md' }),
      ).toBeVisible();
    } finally {
      rmSync(newPath, { force: true });
    }
  });

  test('ルート外への /content・/open-file は 403', async ({ page }) => {
    const outside = join(process.cwd(), 'README.md');
    const contentRes = await page.request.get(
      `http://localhost:${port}/content?file=${encodeURIComponent(outside)}`,
    );
    expect(contentRes.status()).toBe(403);
    const openRes = await page.request.post(
      `http://localhost:${port}/open-file`,
      { data: { path: outside } },
    );
    expect(openRes.status()).toBe(403);
  });

  test('「フォルダを開く」でルートを切り替えられる（タブは維持）', async ({
    page,
  }) => {
    await gotoTree(page);
    // タブを 1 つ開いておく
    await page
      .getByTestId('tree-file')
      .filter({ hasText: 'README.md' })
      .click();
    await expect(
      page.locator('#file-tabs button', { hasText: 'README.md' }),
    ).toBeVisible();

    // OS ネイティブダイアログは Playwright で操作できないため、
    // 選択結果を返す /pick-dir をモックして後続の /open-dir フローを検証する。
    await page.route('**/pick-dir', (route) =>
      route.fulfill({ json: { path: join(treeDir, 'docs') } }),
    );
    await page.getByTestId('open-dir-btn').click();

    await expect(page.getByTestId('tree-root-name')).toContainText('docs');
    await expect(
      page.getByTestId('tree-file').filter({ hasText: 'guide.md' }),
    ).toBeVisible();
    // ルート切替後もタブは残る
    await expect(
      page.locator('#file-tabs button', { hasText: 'README.md' }),
    ).toBeVisible();

    // 後続テストのために元のルートへ戻す
    await page.route('**/pick-dir', (route) =>
      route.fulfill({ json: { path: treeDir } }),
    );
    await page.getByTestId('open-dir-btn').click();
    await expect(
      page.getByTestId('tree-dir').filter({ hasText: 'docs' }),
    ).toBeVisible();
  });

  test('存在しないディレクトリを開こうとするとトーストが出る', async ({
    page,
  }) => {
    await gotoTree(page);
    await page.route('**/pick-dir', (route) =>
      route.fulfill({ json: { path: '/no/such/dir' } }),
    );
    await page.getByTestId('open-dir-btn').click();
    await expect(page.locator('#toast')).toContainText(
      'ディレクトリを開けませんでした',
      { timeout: 3000 },
    );
  });

  test('ダイアログでキャンセルすると何も起きない', async ({ page }) => {
    await gotoTree(page);
    await page.route('**/pick-dir', (route) =>
      route.fulfill({ json: { path: null } }),
    );
    await page.getByTestId('open-dir-btn').click();
    await expect(
      page.getByTestId('tree-dir').filter({ hasText: 'docs' }),
    ).toBeVisible();
  });

  test('「ファイルを開く」でOSダイアログから選んだファイルが開く', async ({
    page,
  }) => {
    await gotoTree(page);
    await page.route('**/pick-file', (route) =>
      route.fulfill({ json: { path: guidePath } }),
    );
    await page.getByTestId('open-file-btn').click();

    await expect(
      page.locator('#file-tabs button', { hasText: 'guide.md' }),
    ).toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Guide');
  });

  test('「ファイルを開く」でキャンセルするとタブは増えない', async ({
    page,
  }) => {
    await gotoTree(page);
    const tabsBefore = await page.locator('#file-tabs button').count();

    await page.route('**/pick-file', (route) =>
      route.fulfill({ json: { path: null } }),
    );
    await page.getByTestId('open-file-btn').click();

    await expect(page.locator('#file-tabs button')).toHaveCount(tabsBefore);
  });
});
