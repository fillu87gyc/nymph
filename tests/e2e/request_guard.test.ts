/**
 * ブラウザ経由でこの API に届くリクエストの入口検査。
 *
 * サーバーは 127.0.0.1 にしかバインドしないが、それは「LAN から届かない」
 * であって「ブラウザから届かない」ではない。ユーザーが開いている任意の
 * Web ページは `http://127.0.0.1:<port>` を叩けるし、nymph が使うポートは
 * 6276 から 20 個しかないので総当たりもできる。`POST /comments` は全量置換
 * なので、通ってしまえば開いているレビューのコメントが 1 発で消える。
 *
 * **Chromium 上でこの攻撃を実演することはできない**。Private Network Access
 * により、public なオリジンからループバックへのリクエストはブラウザ自身が
 * 塞ぐためで、外部オリジンのページを開いて fetch させてもサーバーまで届かない
 * （＝サーバー側の検査を外しても攻撃は成立せず、テストの意味が無くなる）。
 * PNA を実装していないブラウザ（Firefox / Safari）ではサーバーまで届くので、
 * ここでは **そのブラウザが送るのと同じヘッダー** を明示的に組み立てて、
 * サーバーが自力で拒否することを確かめる。あわせて、正規の画面からの操作が
 * 従来どおり通ることも押さえる。
 */

import { rmSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

const EVIL_ORIGIN = 'http://evil.example';

const COMMENT = {
  id: 'c_guard1',
  lineStart: 1,
  lineEnd: 1,
  block_type: 'paragraph',
  context: '',
  text: '入口検査のテスト用コメント',
};

/** 現在開いているページの URL からこのワーカーのポートを取り出す。 */
function portOf(url: string): string {
  return new URL(url).port;
}

test.describe('リクエストの入口検査', () => {
  test.beforeEach(async ({ page, reviewDir }) => {
    rmSync(reviewDir, { recursive: true, force: true });
    await page.goto('/');
  });

  test.afterEach(async ({ reviewDir }) => {
    rmSync(reviewDir, { recursive: true, force: true });
  });

  test('外部オリジンからの POST /comments を拒否し、コメントを壊させない', async ({
    page,
  }) => {
    const port = portOf(page.url());

    // 正規の経路でコメントを 1 件置いておく
    await page.request.post('/comments', { data: [COMMENT] });

    // 攻撃者のページ（http://evil.example）から
    // `fetch('http://127.0.0.1:<port>/comments', { method: 'POST',
    //   headers: { 'Content-Type': 'text/plain' }, body: '[]' })`
    // を実行したときにブラウザが送るヘッダーそのもの。Content-Type が
    // text/plain なのでプリフライトは飛ばず、サーバーには直接届く。
    // POST /comments は全量置換なので、通れば `[]` で上書きされる。
    const res = await page.request.post(`http://127.0.0.1:${port}/comments`, {
      headers: {
        origin: EVIL_ORIGIN,
        'sec-fetch-site': 'cross-site',
        'content-type': 'text/plain',
      },
      data: '[]',
    });
    expect(res.status()).toBe(403);

    const after = await page.request.get(`http://127.0.0.1:${port}/comments`);
    const body = (await after.json()) as { comments: { id: string }[] };
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].id).toBe(COMMENT.id);
  });

  // Sec-Fetch-Site を送らない古いブラウザからでも、cross-origin の POST には
  // 必ず Origin が付く。Origin 単体でも落とせることを確かめる。
  test('Sec-Fetch-Site が無くても Origin だけで拒否する', async ({ page }) => {
    const port = portOf(page.url());

    const res = await page.request.post(`http://127.0.0.1:${port}/comments`, {
      headers: { origin: EVIL_ORIGIN, 'content-type': 'text/plain' },
      data: '[]',
    });
    expect(res.status()).toBe(403);
  });

  // <img> や <form> は Origin を送らないため、Origin だけを見る検査では
  // GET 経由の副作用を防げない。ブラウザが必ず送る Sec-Fetch-Site で落とす。
  test('クロスサイトからの GET を拒否する', async ({ page }) => {
    const port = portOf(page.url());

    const res = await page.request.get(`http://127.0.0.1:${port}/files`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(res.status()).toBe(403);
  });

  test('Host がループバック以外のリクエストを拒否する（DNS rebinding）', async ({
    page,
  }) => {
    const port = portOf(page.url());

    const res = await page.request.get(`http://127.0.0.1:${port}/files`, {
      headers: { host: 'nymph.evil.example' },
    });
    expect(res.status()).toBe(403);
  });

  test('正規の画面からの POST /comments は通る', async ({ page }) => {
    const port = portOf(page.url());

    const status = await page.evaluate(async (comment) => {
      const res = await fetch('/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([comment]),
      });
      return res.status;
    }, COMMENT);
    expect(status).toBe(200);

    const res = await page.request.get(`http://127.0.0.1:${port}/comments`);
    const body = (await res.json()) as { comments: { id: string }[] };
    expect(body.comments).toHaveLength(1);
  });
});
