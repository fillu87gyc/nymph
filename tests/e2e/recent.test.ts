import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, pollUntilReady, test } from './fixtures.ts';

// ───────────────────────────────────────────────────────────
// 1. ツールバーの「最近」メニュー（標準ワーカーサーバー）
//    CLI 起動時に fixture が履歴へ記録されている前提で検証する。
// ───────────────────────────────────────────────────────────

test.describe('最近開いたファイル（ツールバー）', () => {
  test('「最近」ボタンでドロップダウンが開き、起動したファイルが載っている', async ({
    page,
    fixturePath,
  }) => {
    await page.goto('/');
    await page.getByTestId('recent-menu-btn').click();
    await expect(page.getByTestId('recent-menu')).toBeVisible();
    await expect(
      page.getByTestId('recent-item').filter({ hasText: basename(fixturePath) }),
    ).toBeVisible();
  });

  test('Ctrl+R でメニューが開く（ページはリロードされない）', async ({
    page,
  }) => {
    await page.goto('/');
    // キーハンドラ登録（App マウント）を待ってから押す
    await expect(page.getByTestId('recent-menu-btn')).toBeVisible();
    // リロードされていないことを後で確認するためのマーカー
    await page.evaluate(() => {
      (window as unknown as { __nymphMarker: number }).__nymphMarker = 1;
    });
    await page.keyboard.press('Control+r');
    await expect(page.getByTestId('recent-menu')).toBeVisible();
    const marker = await page.evaluate(
      () => (window as unknown as { __nymphMarker?: number }).__nymphMarker,
    );
    expect(marker).toBe(1);
    // もう一度押すと閉じる
    await page.keyboard.press('Control+r');
    await expect(page.getByTestId('recent-menu')).not.toBeVisible();
  });

  test('履歴のファイルをクリックして開ける', async ({ page, fixturePath }) => {
    await page.goto('/');
    await page.getByTestId('recent-menu-btn').click();
    await page
      .getByTestId('recent-item')
      .filter({ hasText: basename(fixturePath) })
      .click();
    await expect(page.getByTestId('recent-menu')).not.toBeVisible();
    await expect(
      page.locator('#file-tabs button', { hasText: basename(fixturePath) }),
    ).toBeVisible();
    await expect(page.locator('#content h1').first()).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────
// 2. 引数なし起動の welcome 画面 + /open-file フロー（専用サーバー）
//    履歴を事前シードした XDG_DATA_HOME を渡して起動する。
// ───────────────────────────────────────────────────────────

const RECENT_BASE_PORT = 6400;

test.describe('最近開いたファイル（welcome 画面）', () => {
  let proc: ChildProcess;
  let port: number;
  let tmpDir: string;
  let mdPath: string;

  test.beforeAll(async ({}, workerInfo) => {
    port = RECENT_BASE_PORT + workerInfo.workerIndex;
    tmpDir = join(
      process.cwd(),
      `tests/fixtures/recent-tmp-w${workerInfo.workerIndex}`,
    );
    mdPath = join(tmpDir, 'history.md');
    mkdirSync(join(tmpDir, 'xdg', 'nymph'), { recursive: true });
    writeFileSync(mdPath, '# History File\n\nfrom recent\n');
    writeFileSync(
      join(tmpDir, 'xdg', 'nymph', 'recent.json'),
      JSON.stringify({
        version: 1,
        entries: [{ path: mdPath, openedAt: new Date().toISOString() }],
      }),
    );

    proc = spawn('bun', ['src/cli.ts', '-p', String(port)], {
      env: {
        ...process.env,
        NYMPH_NO_OPEN: '1',
        NYMPH_DICT_DIR: join(tmpDir, 'dict'),
        XDG_DATA_HOME: join(tmpDir, 'xdg'),
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
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('welcome 画面に履歴が表示され、クリックで開ける（開いた後のホットリロード含む）', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    const item = page.getByTestId('welcome-recent-item');
    await expect(item.filter({ hasText: 'history.md' })).toBeVisible();
    await item.filter({ hasText: 'history.md' }).click();

    await expect(
      page.locator('#file-tabs button', { hasText: 'history.md' }),
    ).toBeVisible();
    await expect(page.locator('#content h1')).toContainText('History File');

    // SSE: 接続確立後に /open-file で開いたファイルもホットリロードされる
    writeFileSync(mdPath, '# Updated Heading\n');
    await expect(page.locator('#content h1')).toContainText(
      'Updated Heading',
      { timeout: 5000 },
    );
    // afterEach 相当の復元（このファイルはこのテスト専用）
    writeFileSync(mdPath, '# History File\n\nfrom recent\n');
  });

  test('履歴にもルートにも無いパスへの /open-file は 403', async ({
    page,
  }) => {
    const res = await page.request.post(`http://localhost:${port}/open-file`, {
      data: { path: join(process.cwd(), 'README.md') },
    });
    expect(res.status()).toBe(403);
  });

  test('.md 以外のパスへの /open-file は 403', async ({ page }) => {
    const res = await page.request.post(`http://localhost:${port}/open-file`, {
      data: { path: '/etc/hostname' },
    });
    expect(res.status()).toBe(403);
  });
});
