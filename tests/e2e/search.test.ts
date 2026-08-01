import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, pollUntilReady, test } from './fixtures.ts';

// 全文検索（Quick Open 統合）の専用サーバー（ディレクトリモードで起動）。
// 他の専用サーバー（6400+/6450+/6500+/6550+/6600+/6650+）と衝突しないポート帯。
const SEARCH_BASE_PORT = 6700;

let proc: ChildProcess;
let port: number;
let searchDir: string;

// "zephyr" は本文のみ（ファイル名には含まれない）に登場する検索語
const NOTES_MD = [
  '# Notes',
  '',
  'Intro paragraph without the keyword.',
  '',
  '## Section One',
  '',
  'Some filler text line.',
  '',
  '## Section Two',
  '',
  'More filler to push the target down.',
  '',
  '## Section Three',
  '',
  'A gentle zephyr blows through the valley.',
  '',
  'Closing remark.',
  '',
].join('\n');

// 見出しをあえて "Breeze" にして、ファイル名（wind.md）のみに一致する
// クエリ "wind" が本文に一致しないようにする
const WIND_MD = ['# Breeze', '', 'zephyr also lives here.', ''].join('\n');

async function gotoApp(page: Page) {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#file-tree')).toBeVisible();
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  port = SEARCH_BASE_PORT + workerInfo.workerIndex;
  searchDir = join(
    process.cwd(),
    `tests/fixtures/searchdir-w${workerInfo.workerIndex}`,
  );

  rmSync(searchDir, { recursive: true, force: true });
  mkdirSync(join(searchDir, 'docs'), { recursive: true });
  writeFileSync(join(searchDir, 'notes.md'), NOTES_MD);
  writeFileSync(join(searchDir, 'docs', 'wind.md'), WIND_MD);

  proc = spawn('bun', ['src/cli.ts', '-p', String(port), searchDir], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: join(searchDir, '.dict'),
      XDG_DATA_HOME: join(searchDir, '.xdg'),
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
  rmSync(searchDir, { recursive: true, force: true });
});

test.describe('全文検索（Quick Open 統合）', () => {
  test('GET /search がスニペットとコンテキストを返す', async ({ page }) => {
    const res = await page.request.get(
      `http://localhost:${port}/search?q=zephyr`,
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.truncated).toBe(false);
    expect(body.results).toHaveLength(2);

    const notes = body.results.find(
      (r: { name: string }) => r.name === 'notes.md',
    );
    const match = notes.matches[0];
    expect(match.line).toBe(15);
    expect(match.text).toBe('A gentle zephyr blows through the valley.');
    expect(match.text.slice(match.start, match.end)).toBe('zephyr');
    // 前後1行のコンテキスト（空行）
    expect(match.before).toEqual(['']);
    expect(match.after).toEqual(['']);
  });

  test('本文のみ一致する語で「本文の一致」セクションが出る', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await page.getByTestId('quick-open-input').fill('zephyr');

    // ファイル名候補には一致しないので出ない
    await expect(page.getByTestId('quick-open-item')).toHaveCount(0);
    // 本文マッチが 2 ファイル分出る
    const matches = page.getByTestId('quick-open-match');
    await expect(matches).toHaveCount(2);
    await expect(matches.filter({ hasText: 'notes.md' })).toBeVisible();
    await expect(matches.filter({ hasText: 'wind.md' })).toBeVisible();
    // 検索語が <mark> でハイライトされる
    await expect(
      matches.filter({ hasText: 'notes.md' }).locator('mark'),
    ).toHaveText('zephyr');
  });

  test('↑↓と Enter で本文マッチのファイルが開き該当ブロックがフラッシュする', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await page.getByTestId('quick-open-input').fill('zephyr');
    const matches = page.getByTestId('quick-open-match');
    await expect(matches).toHaveCount(2);

    // ファイル候補が 0 件なので先頭の本文マッチ（ツリー順で docs/wind.md）が
    // 選択されている。↓ で 2 件目（notes.md）へ移動して Enter で開く。
    await expect(matches.first()).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(matches.nth(1)).toHaveAttribute('data-selected', 'true');
    await expect(matches.nth(1)).toContainText('notes.md');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('quick-open')).not.toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Notes');
    // 該当行（15行目）を含むブロックがフラッシュする
    const block = page.locator('#content [data-block][data-line-start="15"]');
    await expect(block).toHaveAttribute('data-highlighted', 'true', {
      timeout: 3000,
    });
    await expect(block).toContainText('zephyr');
  });

  test('クリックでも本文マッチを開ける', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await page.getByTestId('quick-open-input').fill('zephyr');
    await page
      .getByTestId('quick-open-match')
      .filter({ hasText: 'wind.md' })
      .click();
    await expect(page.getByTestId('quick-open')).not.toBeVisible();
    await expect(page.locator('#content h1')).toContainText('Breeze');
    await expect(
      page.locator('#content [data-highlighted="true"]'),
    ).toContainText('zephyr', { timeout: 3000 });
  });

  test('1文字クエリでは本文検索されない', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    await page.getByTestId('quick-open-input').fill('z');
    // デバウンス（useSearch.ts の DEBOUNCE_MS=120ms）経過後も本文セクションは出ない
    await page.waitForTimeout(250);
    await expect(page.getByTestId('quick-open-match')).toHaveCount(0);
  });

  test('ファイル名のみ一致では本文セクションは出ない', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+p');
    // "wind" はファイル名（wind.md）にのみ一致する（本文の見出しは Breeze）
    await page.getByTestId('quick-open-input').fill('wind');
    await expect(
      page.getByTestId('quick-open-item').filter({ hasText: 'wind.md' }),
    ).toBeVisible();
    // デバウンス（useSearch.ts の DEBOUNCE_MS=120ms）経過後も本文セクションは出ない
    await page.waitForTimeout(250);
    await expect(page.getByTestId('quick-open-match')).toHaveCount(0);
  });
});
