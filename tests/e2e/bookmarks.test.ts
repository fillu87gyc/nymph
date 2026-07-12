import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, pollUntilReady, test } from './fixtures.ts';

// ブックマーク機能の専用サーバー（ディレクトリモードで起動）。
// 標準ワーカー（6276+）・recent（6400+）・tree（6450+）と衝突しないポート帯。
const BM_BASE_PORT = 6500;

let proc: ChildProcess;
let port: number;
let bmDir: string;
let outsideMd: string;

async function gotoApp(page: Page) {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#file-tree')).toBeVisible();
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  port = BM_BASE_PORT + workerInfo.workerIndex;
  bmDir = join(
    process.cwd(),
    `tests/fixtures/bmdir-w${workerInfo.workerIndex}`,
  );
  outsideMd = join(
    process.cwd(),
    `tests/fixtures/bm-outside-w${workerInfo.workerIndex}.md`,
  );

  rmSync(bmDir, { recursive: true, force: true });
  mkdirSync(join(bmDir, 'docs'), { recursive: true });
  writeFileSync(join(bmDir, 'README.md'), '# BM Root\n');
  writeFileSync(join(bmDir, 'docs', 'memo.md'), '# Memo\n');
  writeFileSync(outsideMd, '# Outside\n');

  proc = spawn('bun', ['src/cli.ts', '-p', String(port), bmDir], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: join(bmDir, '.dict'),
      XDG_DATA_HOME: join(bmDir, '.xdg'),
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
  rmSync(bmDir, { recursive: true, force: true });
  rmSync(outsideMd, { force: true });
});

test.describe('ブックマーク', () => {
  test('ファイル未選択時はルート dir が★対象になり、メニューから選んでルート切替できる', async ({
    page,
  }) => {
    await gotoApp(page);
    // ファイル未選択 → ★はルート dir を登録する
    await expect(page.getByTestId('bookmark-toggle')).toContainText('☆');
    await page.getByTestId('bookmark-toggle').click();
    await expect(page.locator('#toast')).toContainText(
      'ブックマークに追加しました',
      { timeout: 3000 },
    );
    await expect(page.getByTestId('bookmark-toggle')).toContainText('★');

    // サブディレクトリへルートを切り替えてから、ブックマークで戻る
    // OS ネイティブダイアログは Playwright で操作できないため /pick-dir をモックする
    await page.route('**/pick-dir', (route) =>
      route.fulfill({ json: { path: join(bmDir, 'docs') } }),
    );
    await page.getByTestId('open-dir-btn').click();
    await expect(page.getByTestId('tree-root-name')).toContainText('docs');

    await page.getByTestId('recent-menu-btn').click();
    const dirItem = page
      .getByTestId('bookmark-item')
      .filter({ hasText: `bmdir-w${test.info().workerIndex}` });
    await expect(dirItem).toHaveAttribute('data-type', 'dir');
    await dirItem.click();
    await expect(page.getByTestId('tree-root-name')).toContainText(
      `bmdir-w${test.info().workerIndex}`,
    );

    // 後片付け: ルート dir の★を解除
    await page.getByTestId('bookmark-toggle').click();
    await expect(page.getByTestId('bookmark-toggle')).toContainText('☆');
  });

  test('開いたファイルを★するとメニューに出現し、解除で消える（リロード永続も確認）', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.getByTestId('tree-file').filter({ hasText: 'memo.md' }).click();
    await expect(page.locator('#content h1')).toContainText('Memo');

    await page.getByTestId('bookmark-toggle').click();
    await expect(page.getByTestId('bookmark-toggle')).toContainText('★');

    // メニューに file ブックマークとして出る
    await page.getByTestId('recent-menu-btn').click();
    const item = page
      .getByTestId('bookmark-item')
      .filter({ hasText: 'memo.md' });
    await expect(item).toHaveAttribute('data-type', 'file');
    await page.getByTestId('recent-menu-btn').click(); // メニューを閉じる

    // リロードしても永続している
    await page.reload();
    await expect(page.getByTestId('bookmark-toggle')).toContainText('★', {
      timeout: 5000,
    });

    // 解除すると消える
    await page.getByTestId('bookmark-toggle').click();
    await expect(page.getByTestId('bookmark-toggle')).toContainText('☆');
    await page.getByTestId('recent-menu-btn').click();
    await expect(
      page.getByTestId('bookmark-item').filter({ hasText: 'memo.md' }),
    ).not.toBeVisible();
  });

  test('ブックマーク済みならルート外ファイルも /open-file できる（未登録は 403）', async ({
    page,
  }) => {
    // 未登録のルート外ファイルは 403
    const before = await page.request.post(
      `http://localhost:${port}/open-file`,
      { data: { path: outsideMd } },
    );
    expect(before.status()).toBe(403);

    // ブックマーク登録すると 200
    const toggleRes = await page.request.post(
      `http://localhost:${port}/bookmarks/toggle`,
      { data: { path: outsideMd, type: 'file' } },
    );
    expect(toggleRes.ok()).toBeTruthy();
    const after = await page.request.post(
      `http://localhost:${port}/open-file`,
      { data: { path: outsideMd } },
    );
    expect(after.status()).toBe(200);

    // 後片付け（登録解除）
    await page.request.post(`http://localhost:${port}/bookmarks/toggle`, {
      data: { path: outsideMd, type: 'file' },
    });
  });
});
