/**
 * `nymph <file> --export <out.html>` の E2E。
 *
 * CLI を実際に走らせて HTML を書き出し、生成物をブラウザで開いて確かめる。
 * サーバーは起動しないので worker 分離のフィクスチャは使わず、素の
 * Playwright テストとして書く（ポート帯の割り当ても不要）。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Comment } from '../../src/client/types.ts';
import { reviewKey } from '../../src/reviewStore.ts';

const NYMPH_ROOT = process.cwd();

const DOC = `# レビュー対象

これは本文の段落です。

## コード

\`\`\`ts
const answer = 42;
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

<script>window.__pwned = true;</script>
`;

const COMMENTS: Comment[] = [
  {
    id: 'c_open01',
    lineStart: 3,
    lineEnd: 3,
    block_type: 'paragraph',
    context: 'これは本文の段落です。',
    text: '主語が曖昧です',
  },
  {
    id: 'c_done01',
    lineStart: 5,
    lineEnd: 5,
    block_type: 'heading',
    context: '## コード',
    text: '見出しの表記ゆれは直しました',
    resolved: true,
  },
  {
    id: 'c_gone01',
    lineStart: 999,
    lineEnd: 999,
    block_type: 'paragraph',
    context: 'もう存在しない段落',
    text: '対象が消えた指摘',
  },
];

let dir: string;
let mdPath: string;
let outPath: string;
let xdgDir: string;

function runCli(args: string[]) {
  return spawnSync('bun', ['src/cli.ts', ...args], {
    cwd: NYMPH_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, XDG_DATA_HOME: xdgDir },
    timeout: 30000,
  });
}

test.beforeAll(({ browserName: _browserName }, workerInfo) => {
  dir = join(NYMPH_ROOT, `tests/fixtures/export-w${workerInfo.workerIndex}`);
  mdPath = join(dir, 'report.md');
  outPath = join(dir, 'review.html');
  xdgDir = join(dir, 'xdg');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(mdPath, DOC);

  // 保存済みレビューデータ（新store）を用意する
  const reviewDir = join(xdgDir, 'nymph', 'reviews', reviewKey(mdPath));
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(
    join(reviewDir, 'comments.json'),
    `${JSON.stringify(
      {
        version: 2,
        file: mdPath,
        updatedAt: new Date().toISOString(),
        round: 2,
        comments: COMMENTS,
      },
      null,
      2,
    )}\n`,
  );
});

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test.describe('nymph --export', () => {
  test('CLI が HTML を書き出して 0 で終わる', () => {
    const result = runCli([mdPath, '--export', outPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(outPath);
    expect(result.stdout).toContain('コメント      3 件');
    expect(readFileSync(outPath, 'utf-8')).toContain('<!doctype html>');
  });

  test('生成物は外部リクエストなしで本文とコメントを表示する', async ({
    page,
  }) => {
    expect(runCli([mdPath, '--export', outPath]).status).toBe(0);

    // 外部ホストへ出ようとしたら失敗させる（単体で完結していることの担保）
    const external: string[] = [];
    await page.route(/^https?:\/\//, (route) => {
      external.push(route.request().url());
      return route.abort();
    });

    await page.goto(pathToFileURL(outPath).href);

    await expect(
      page.getByRole('heading', { name: 'レビュー対象' }),
    ).toBeVisible();
    // 段落本文はブロックの中で見る（同じ文言がコメントの「対象」行にも出る）
    await expect(
      page.locator('section.block[data-line-start="3"] > p'),
    ).toHaveText('これは本文の段落です。');
    await expect(page.getByText('const answer = 42;')).toBeVisible();
    // Mermaid はソースを見せる（描画にはブラウザ側のライブラリが要るため）
    await expect(page.getByText('graph TD')).toBeVisible();

    await expect(page.getByText('主語が曖昧です')).toBeVisible();
    await expect(page.getByText('見出しの表記ゆれは直しました')).toBeVisible();
    await expect(page.getByText('対象が消えた指摘')).toBeVisible();

    expect(external).toEqual([]);
  });

  test('本文中の生 HTML は実行されずそのまま見える', async ({ page }) => {
    expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
    await page.goto(pathToFileURL(outPath).href);

    await expect(
      page.getByText('<script>window.__pwned = true;</script>'),
    ).toBeVisible();
    expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
  });

  test('コメントは対象ブロックの中に置かれる', async ({ page }) => {
    expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
    await page.goto(pathToFileURL(outPath).href);

    const block = page.locator('section.block[data-line-start="3"]');
    await expect(block).toHaveAttribute('data-commented', 'true');
    await expect(block.getByText('主語が曖昧です')).toBeVisible();

    // 対象が消えたコメントは末尾のセクションへ回る
    await expect(
      page.locator('.unanchored').getByText('対象が消えた指摘'),
    ).toBeVisible();
  });

  // PR に貼るデモ用。CI がこのディレクトリの PNG を description へ埋め込む。
  test.describe('デモ用スクリーンショット', () => {
    test.use({ colorScheme: 'dark', viewport: { width: 1100, height: 1000 } });

    test('生成物の見た目', async ({ page }) => {
      expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
      await page.goto(pathToFileURL(outPath).href);
      await expect(page.getByText('主語が曖昧です')).toBeVisible();

      mkdirSync('playwright-screenshots', { recursive: true });
      await page.screenshot({
        path: 'playwright-screenshots/export-html.png',
        fullPage: true,
      });
    });
  });

  test('ヘッダーに状態別の件数とラウンドが出る', async ({ page }) => {
    expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
    await page.goto(pathToFileURL(outPath).href);

    await expect(page.getByText('未解決 1', { exact: true })).toBeVisible();
    await expect(page.getByText('解決済 1', { exact: true })).toBeVisible();
    await expect(page.getByText('削除済 1', { exact: true })).toBeVisible();
    await expect(page.getByText('ラウンド 2', { exact: true })).toBeVisible();
  });

  test('解決済みを隠すトグルが効く', async ({ page }) => {
    expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
    await page.goto(pathToFileURL(outPath).href);

    const resolved = page.getByText('見出しの表記ゆれは直しました');
    await expect(resolved).toBeVisible();

    await page.getByRole('button', { name: '解決済みを隠す' }).click();
    await expect(resolved).toBeHidden();
    await expect(page.getByText('主語が曖昧です')).toBeVisible();

    await page.getByRole('button', { name: '解決済みを表示' }).click();
    await expect(resolved).toBeVisible();
  });

  // 初期テーマは OS の設定に従うため、テストでは明示的に固定する。
  test.describe('テーマ', () => {
    test.use({ colorScheme: 'dark' });

    test('OS がダークなら初期表示もダーク。ボタンで切り替えられる', async ({
      page,
    }) => {
      expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
      await page.goto(pathToFileURL(outPath).href);

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'ライト' }).click();
      await expect(html).toHaveAttribute('data-theme', 'light');
      await page.getByRole('button', { name: 'ダーク' }).click();
      await expect(html).toHaveAttribute('data-theme', 'dark');
    });
  });

  test.describe('テーマ（ライト環境）', () => {
    test.use({ colorScheme: 'light' });

    test('OS がライトなら初期表示もライト', async ({ page }) => {
      expect(runCli([mdPath, '--export', outPath]).status).toBe(0);
      await page.goto(pathToFileURL(outPath).href);

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  });

  test('ローカル画像はデータ URI として焼き込まれる', async ({ page }) => {
    const imgDir = join(dir, 'img');
    mkdirSync(imgDir, { recursive: true });
    writeFileSync(
      join(imgDir, 'dot.gif'),
      Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
    );
    const withImage = join(dir, 'with-image.md');
    writeFileSync(withImage, '# 図あり\n\n![点](./img/dot.gif)\n');
    const imageOut = join(dir, 'with-image.html');

    expect(runCli([withImage, '--export', imageOut]).status).toBe(0);
    await page.goto(pathToFileURL(imageOut).href);

    const img = page.getByAltText('点');
    await expect(img).toBeVisible();
    expect(await img.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
  });

  test('ファイルを指定しないとエラーで落ちる', () => {
    const result = runCli(['--export', outPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.md ファイルを1つ指定してください');
  });

  test('ファイルを複数指定するとエラーで落ちる', () => {
    const second = join(dir, 'other.md');
    writeFileSync(second, '# もう1つ\n');
    const result = runCli([mdPath, second, '--export', outPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--export で扱えるファイルは1つだけです');
  });

  test('--export に値が無いとエラーで落ちる', () => {
    const result = runCli([mdPath, '--export']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--export には値を指定してください');
  });

  test('--export はサーバーを起動せず既存インスタンスにも委譲しない', () => {
    const result = runCli([mdPath, '--export', outPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('http://localhost');
    expect(result.stdout).not.toContain('既存のインスタンス');
  });
});
