/**
 * 本文中の画像が「md ファイルを起点とした相対パス」で表示されることを守る。
 *
 * 相対パスをブラウザに任せると画面の URL 基準で解決されて必ず 404 になるため、
 * クライアントは `<img src>` を `/image` へ向け直す。ここでは実際に画像が
 * ロードされること（naturalWidth > 0）と、`/image` が任意ファイルの読み出し
 * 窓口になっていないことを確認する。
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { closeSecondFile, expect, openSecondFile, test } from './fixtures.ts';

const ORIGINAL = readFileSync(
  join(process.cwd(), 'tests/fixtures/sample.md'),
  'utf-8',
);

/** 1x1 の PNG（内容は問わないので最小のものを使う）。 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** ワーカー専用の画像置き場（md と同じディレクトリの配下 = 範囲内）。 */
function imageDir(fixturePath: string): string {
  return join(dirname(fixturePath), `img-${basename(fixturePath, '.md')}`);
}

/** 範囲外（md のディレクトリの外）に置く画像。 */
function outsideImage(fixturePath: string): string {
  return join(
    process.cwd(),
    'tests/e2e',
    `outside-${basename(fixturePath, '.md')}.png`,
  );
}

test.beforeEach(async ({ fixturePath }) => {
  const dir = imageDir(fixturePath);
  mkdirSync(join(dir, 'nested'), { recursive: true });
  writeFileSync(join(dir, 'logo.png'), PNG_1X1);
  writeFileSync(join(dir, 'nested', '図 1.png'), PNG_1X1);
  writeFileSync(outsideImage(fixturePath), PNG_1X1);
});

test.afterEach(async ({ fixturePath }) => {
  writeFileSync(fixturePath, ORIGINAL);
  rmSync(imageDir(fixturePath), { recursive: true, force: true });
  rmSync(outsideImage(fixturePath), { force: true });
});

test('md と同じ場所からの相対パスで画像が表示される', async ({
  page,
  fixturePath,
}) => {
  const dir = basename(imageDir(fixturePath));
  writeFileSync(fixturePath, `# 画像\n\n![ロゴ](./${dir}/logo.png)\n`);
  await page.goto('/');

  const img = page.locator('#content img');
  await expect(img).toHaveAttribute('src', /^\/image\?file=/);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
});

test('サブディレクトリ・空白や日本語を含むパスでも表示される', async ({
  page,
  fixturePath,
}) => {
  const dir = basename(imageDir(fixturePath));
  writeFileSync(fixturePath, `# 画像\n\n![図](${dir}/nested/図%201.png)\n`);
  await page.goto('/');

  const img = page.locator('#content img');
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
});

test('本文に直接書いた img タグの相対パスも表示される', async ({
  page,
  fixturePath,
}) => {
  const dir = basename(imageDir(fixturePath));
  writeFileSync(
    fixturePath,
    `# 画像\n\n<p><img src="./${dir}/logo.png" alt="ロゴ"></p>\n`,
  );
  await page.goto('/');

  const img = page.locator('#content img');
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
});

test('起点は表示中のファイル（タブを切り替えるとそのファイル基準になる）', async ({
  page,
  fixturePath,
}) => {
  const dir = basename(imageDir(fixturePath));
  writeFileSync(fixturePath, `# 1枚目\n\n![ロゴ](./${dir}/logo.png)\n`);
  await page.goto('/');

  const second = await openSecondFile(page, fixturePath);
  writeFileSync(second.path, `# 2枚目\n\n![図](${dir}/nested/図%201.png)\n`);
  await page.reload();

  const img = page.locator('#content img');
  await expect
    .poll(() => img.getAttribute('src'))
    .toContain(`file=${encodeURIComponent(second.path)}`);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);

  await closeSecondFile(page, second.path);
});

test('外部 URL の画像はそのままの src で残る', async ({
  page,
  fixturePath,
}) => {
  writeFileSync(fixturePath, '# 画像\n\n![外](https://example.com/a.png)\n');
  await page.goto('/');

  await expect(page.locator('#content img')).toHaveAttribute(
    'src',
    'https://example.com/a.png',
  );
});

test('/image は範囲外のファイルと画像以外を拒否する', async ({
  page,
  fixturePath,
}) => {
  const dir = basename(imageDir(fixturePath));
  await page.goto('/');

  // 範囲内の画像は 200 + 画像の Content-Type
  const ok = await page.request.get(
    `/image?file=${encodeURIComponent(fixturePath)}&path=${encodeURIComponent(`./${dir}/logo.png`)}`,
  );
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-type']).toBe('image/png');

  // md のディレクトリの外へ出る行き先は拒否する
  const outside = await page.request.get(
    `/image?file=${encodeURIComponent(fixturePath)}&path=${encodeURIComponent(`../e2e/${basename(outsideImage(fixturePath))}`)}`,
  );
  expect(outside.status()).toBe(403);

  // 画像でない拡張子は配信しない
  const notImage = await page.request.get(
    `/image?file=${encodeURIComponent(fixturePath)}&path=${encodeURIComponent(basename(fixturePath))}`,
  );
  expect(notImage.status()).toBe(403);

  // 開いていないファイルを起点にはできない
  const foreign = await page.request.get(
    `/image?file=${encodeURIComponent('/etc/hosts')}&path=${encodeURIComponent('a.png')}`,
  );
  expect(foreign.status()).toBe(403);
});
