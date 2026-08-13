/**
 * 画面からのエクスポート（⋯ → エクスポート）の E2E。
 *
 * これまで画面から持ち出せる形は「印刷 → PDF」だけで、CLI の
 * `--export`（HTML）/ `--annotate`（Markdown）/ `nymph export`（CSV）は
 * ターミナルへ戻らないと使えなかった。その 3 形式をブラウザから
 * ダウンロードできることを、実際に落ちたファイルの中身で確かめる。
 *
 * 見ているのは 4 点:
 *   1. 3 形式それぞれが正しい名前・正しい中身で落ちる
 *   2. 画面で付けたコメントが生成物に入っている（保存済みデータを読んでいる）
 *   3. Mermaid 同梱は選んだときだけ（既定では 3MB のエンジンを積まない）
 *   4. `/export` が開いていないファイルや未知の形式を断る
 *
 * コメントを書き込むため、reviewDir を beforeEach / afterEach で掃除する。
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, type Page, test } from './fixtures.ts';

test.beforeEach(async ({ page, reviewDir }) => {
  rmSync(reviewDir, { recursive: true, force: true });
  await page.goto('/');
  await expect(
    page.locator('#content [data-testid="md-block"]').first(),
  ).toBeVisible({ timeout: 5000 });
});

test.afterEach(async ({ reviewDir }) => {
  rmSync(reviewDir, { recursive: true, force: true });
});

/**
 * コメントを 1 件付け、**保存済みになるまで**待つ。
 *
 * `/export` はディスクに保存されたコメントを読むため、画面に出た時点では
 * まだ間に合っていないことがある。保存先の comments.json に本文が現れるまで
 * 待って、エクスポートの前提を満たしてから戻る。
 */
async function addComment(
  page: Page,
  reviewCommentsPath: string,
  text: string,
) {
  const block = page
    .locator('#content [data-testid="md-block"][data-block-type="table"]')
    .first();
  await block.hover();
  await block.locator('[data-testid="comment-btn"]').click();
  await page.locator('#comment-ta').fill(text);
  await page.locator('#btn-submit').click();
  await expect(
    page.locator('[data-testid="comment-item"]').first(),
  ).toBeVisible({ timeout: 3000 });
  await expect
    .poll(
      () => {
        try {
          return readFileSync(reviewCommentsPath, 'utf-8');
        } catch {
          return '';
        }
      },
      { timeout: 5000 },
    )
    .toContain(text);
}

/** ⋯ メニューを開いて項目を押し、落ちてきたファイルの名前と中身を返す。 */
async function download(page: Page, testId: string) {
  await page.getByTestId('overflow-menu-btn').click();
  const [downloaded] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(testId).click(),
  ]);
  const path = await downloaded.path();
  return {
    filename: downloaded.suggestedFilename(),
    body: readFileSync(path, 'utf-8'),
  };
}

/** ワーカー専用 fixture（sample-w{n}.md）から期待される出力ファイル名。 */
function expectedName(fixturePath: string, ext: string): string {
  return `${basename(fixturePath, '.md')}-review.${ext}`;
}

test.describe('画面からのエクスポート', () => {
  test('⋯ メニューに HTML / Markdown / CSV の 3 項目が並ぶ', async ({
    page,
  }) => {
    await page.getByTestId('overflow-menu-btn').click();
    const menu = page.getByTestId('overflow-menu');
    await expect(menu.getByTestId('export-html-btn')).toBeVisible();
    await expect(menu.getByTestId('export-md-btn')).toBeVisible();
    await expect(menu.getByTestId('export-csv-btn')).toBeVisible();
    // Mermaid 同梱は既定 off（CLI の --export-mermaid と同じ）
    await expect(menu.getByTestId('export-mermaid-toggle')).not.toBeChecked();
  });

  test('HTML: 単体で開ける 1 枚が落ち、画面で付けたコメントが入っている', async ({
    page,
    fixturePath,
    reviewCommentsPath,
  }) => {
    await addComment(page, reviewCommentsPath, 'HTML へ焼き込まれる指摘');

    const file = await download(page, 'export-html-btn');

    expect(file.filename).toBe(expectedName(fixturePath, 'html'));
    expect(file.body).toContain('<!doctype html>');
    expect(file.body).toContain('Sample');
    expect(file.body).toContain('HTML へ焼き込まれる指摘');
    // 生成物は単体で完結する（外部ホストを読みに行かない）
    expect(file.body).not.toMatch(/<(script|link)[^>]+https?:\/\//);
    // トーストで結果を知らせる
    await expect(page.locator('#toast')).toContainText('書き出しました', {
      timeout: 3000,
    });
  });

  test('Markdown: 本文の隣にコメントが引用で入った .md が落ちる', async ({
    page,
    fixturePath,
    reviewCommentsPath,
  }) => {
    await addComment(page, reviewCommentsPath, 'Markdown へ書き戻される指摘');

    const file = await download(page, 'export-md-btn');

    expect(file.filename).toBe(expectedName(fixturePath, 'md'));
    // 出力名は元ファイルと必ず別（レビュー対象を取り違えない）
    expect(file.filename).not.toBe(basename(fixturePath));
    expect(file.body).toContain('# Sample');
    expect(file.body).toContain('> [nymph]');
    expect(file.body).toContain('Markdown へ書き戻される指摘');
  });

  test('CSV: 1 コメント 1 行の表が BOM 付きで落ちる（Excel 向け）', async ({
    page,
    fixturePath,
    reviewCommentsPath,
  }) => {
    await addComment(page, reviewCommentsPath, 'CSV に並ぶ指摘');

    const file = await download(page, 'export-csv-btn');

    expect(file.filename).toBe(expectedName(fixturePath, 'csv'));
    expect(file.body.startsWith('﻿')).toBe(true);
    expect(file.body).toContain('file,id,status');
    expect(file.body).toContain('CSV に並ぶ指摘');
  });

  test('コメントが 0 件でも 3 形式とも落とせる', async ({ page }) => {
    for (const id of ['export-html-btn', 'export-md-btn', 'export-csv-btn']) {
      const file = await download(page, id);
      expect(file.body.length).toBeGreaterThan(0);
    }
  });

  test('Mermaid 同梱は選んだときだけ（既定では描画エンジンを積まない）', async ({
    page,
  }) => {
    // fixture には mermaid ブロックがある。既定ではソース表示のまま。
    const plain = await download(page, 'export-html-btn');
    expect(plain.body).toContain('graph TD; A--&gt;B');
    expect(plain.body.length).toBeLessThan(1_000_000);

    await page.getByTestId('overflow-menu-btn').click();
    await page.getByTestId('export-mermaid-toggle').check();
    const [downloaded] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-html-btn').click(),
    ]);
    const withEngine = readFileSync(await downloaded.path(), 'utf-8');

    // 描画エンジンが丸ごと入る（オフラインでも図が描かれる）
    expect(withEngine.length).toBeGreaterThan(1_000_000);
    expect(withEngine).toContain('data-mermaid="pending"');
  });
});

test.describe('/export のアクセス制御', () => {
  test('開いていないファイルは 403', async ({ page }) => {
    const res = await page.request.get('/export?file=/etc/passwd&format=html');
    expect(res.status()).toBe(403);
  });

  test('未知の形式は 400', async ({ page, fixturePath }) => {
    const res = await page.request.get(
      `/export?file=${encodeURIComponent(fixturePath)}&format=pdf`,
    );
    expect(res.status()).toBe(400);
  });

  test('添付として返し、勝手に解釈させない', async ({ page, fixturePath }) => {
    const res = await page.request.get(
      `/export?file=${encodeURIComponent(fixturePath)}&format=html`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('attachment');
    expect(res.headers()['content-disposition']).toContain(
      `${basename(fixturePath, '.md')}-review.html`,
    );
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('サーバー側にファイルを残さない（生成物はダウンロードのみ）', async ({
    page,
    fixturePath,
  }) => {
    await download(page, 'export-html-btn');
    // 書き出し先を決めるのはブラウザ。画面を触っただけでレビュー対象の
    // 隣にファイルが増える、が起きていないこと。
    const stem = fixturePath.replace(/\.md$/, '');
    expect(existsSync(`${stem}-review.html`)).toBe(false);
    expect(existsSync(`${fixturePath}-review.html`)).toBe(false);
  });
});
