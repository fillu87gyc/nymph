import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, pollUntilReady, test } from './fixtures.ts';

// Quick Open（Ctrl+P）の専用サーバー（ディレクトリモードで起動）。
// 他の専用サーバー（6400+/6450+/6500+）と衝突しないポート帯。
const QO_BASE_PORT = 6550;

let proc: ChildProcess;
let port: number;
let qoDir: string;

async function gotoApp(page: Page) {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#file-tree')).toBeVisible();
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  port = QO_BASE_PORT + workerInfo.workerIndex;
  qoDir = join(
    process.cwd(),
    `tests/fixtures/qodir-w${workerInfo.workerIndex}`,
  );

  rmSync(qoDir, { recursive: true, force: true });
  mkdirSync(join(qoDir, 'docs'), { recursive: true });
  writeFileSync(join(qoDir, 'alpha.md'), '# Alpha\n');
  writeFileSync(join(qoDir, 'docs', 'beta.md'), '# Beta\n');

  proc = spawn('bun', ['src/cli.ts', '-p', String(port), qoDir], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: join(qoDir, '.dict'),
      XDG_DATA_HOME: join(qoDir, '.xdg'),
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
  rmSync(qoDir, { recursive: true, force: true });
});

test.describe('Quick Open（Ctrl+P）', () => {
  test('Ctrl+P でパレットが開き、絞り込んで Enter でファイルが開く', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await expect(page.getByTestId('quick-open')).toBeVisible();

    // ツリー内の全 .md が候補に出る
    await expect(
      page.getByTestId('quick-open-item').filter({ hasText: 'alpha.md' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('quick-open-item').filter({ hasText: 'beta.md' }),
    ).toBeVisible();

    // 絞り込み → Enter で開く
    await page.getByTestId('quick-open-input').fill('beta');
    await expect(page.getByTestId('quick-open-item')).toHaveCount(1);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('quick-open')).not.toBeVisible();
    await expect(
      page.locator('#file-tabs button', { hasText: 'beta.md' }),
    ).toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Beta');
  });

  test('Esc とオーバーレイクリックで閉じる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await expect(page.getByTestId('quick-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-open')).not.toBeVisible();

    await page.keyboard.press('Control+p');
    await expect(page.getByTestId('quick-open')).toBeVisible();
    await page.getByTestId('quick-open').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('quick-open')).not.toBeVisible();
  });

  test('↑↓ で選択を移動して Enter で開ける', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    const items = page.getByTestId('quick-open-item');
    await expect(items.first()).toBeVisible();

    // 先頭が選択されている
    await expect(items.first()).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(items.first()).toHaveAttribute('data-selected', 'true');
  });

  test('dir ブックマークを選ぶとツリーのルートが切り替わる', async ({
    page,
  }) => {
    // docs を dir ブックマークしておく
    await page.request.post(`http://localhost:${port}/bookmarks/toggle`, {
      data: { path: join(qoDir, 'docs'), type: 'dir' },
    });
    try {
      await gotoApp(page);
      await page.keyboard.press('Control+p');
      const dirItem = page
        .getByTestId('quick-open-item')
        .filter({ hasText: '📁 docs' });
      await expect(dirItem).toBeVisible();
      await dirItem.click();
      await expect(page.getByTestId('quick-open')).not.toBeVisible();
      await expect(page.getByTestId('tree-root-name')).toContainText('docs');
    } finally {
      await page.request.post(`http://localhost:${port}/bookmarks/toggle`, {
        data: { path: join(qoDir, 'docs'), type: 'dir' },
      });
    }
  });
});
