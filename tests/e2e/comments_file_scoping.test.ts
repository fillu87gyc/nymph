import { type ChildProcess, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  type Page,
  pollUntilReady,
  reviewCommentsPathFor,
  test,
} from './fixtures.ts';

// コメント保存先ファイルの指定（?file=）と、ファイル未確定時のエラー応答を
// 検証するための専用ディレクトリモードサーバー。
// 標準ワーカーサーバー・他の専用サーバーと衝突しないポート帯を使う。
const BASE_PORT = 6600;

let proc: ChildProcess;
let port: number;
let dir: string;
let aPath: string;
let bPath: string;

async function gotoTree(page: Page) {
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#file-tree')).toBeVisible();
}

async function addCommentToActiveFile(page: Page, text: string) {
  // comment-btn は table / mermaid ブロックにのみ表示される
  // （MarkdownBlock.tsx の showPlusButton 参照）。
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
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  port = BASE_PORT + workerInfo.workerIndex;
  dir = join(
    process.cwd(),
    `tests/fixtures/scopedir-w${workerInfo.workerIndex}`,
  );
  aPath = join(dir, 'a.md');
  bPath = join(dir, 'b.md');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(aPath, '# File A\n\n| Col |\n| --- |\n| a-1 |\n');
  writeFileSync(bPath, '# File B\n\n| Col |\n| --- |\n| b-1 |\n');

  proc = spawn('bun', ['src/cli.ts', '-p', String(port), dir], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: join(dir, '.dict'),
      XDG_DATA_HOME: join(dir, '.xdg'),
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
  rmSync(dir, { recursive: true, force: true });
});

test.describe('ディレクトリモード起動直後（ファイル未選択）のコメント保存', () => {
  test('POST /comments は保存先未確定のため 4xx を返す（サイレントに成功しない）', async ({
    page,
  }) => {
    await gotoTree(page);
    const res = await page.request.post(`http://localhost:${port}/comments`, {
      data: [],
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('複数ファイル間でのコメント保存先の分離', () => {
  test('ファイルを切り替えてもコメントが混ざらず、別々の新store（reviews/<key>/comments.json）に保存される', async ({
    page,
  }) => {
    // 2ファイルの切替・2回のコメント追加・ディスク検証まで行う多段テストのため
    // デフォルトの 30s では並列実行時の負荷次第でタイムアウトしうる。余裕を持たせる。
    test.setTimeout(45000);
    // このテストは共有ワーカーサーバーを使わず専用サーバーを立てるため、
    // 新store側のパスは自前の XDG_DATA_HOME（beforeAll 参照）から解決する。
    const xdgDataHome = join(dir, '.xdg');
    const aCommentsPath = reviewCommentsPathFor(xdgDataHome, aPath);
    const bCommentsPath = reviewCommentsPathFor(xdgDataHome, bPath);
    rmSync(aCommentsPath, { force: true });
    rmSync(bCommentsPath, { force: true });

    try {
      await gotoTree(page);

      // A を開いてコメントを追加
      await page.getByTestId('tree-file').filter({ hasText: 'a.md' }).click();
      await expect(page.locator('#content h1')).toContainText('File A');
      await addCommentToActiveFile(page, 'comment on A');

      // B を開く（タブが増える）。A のコメントが漏れ出ていないこと。
      // （パネルは A へのコメント追加で既に開いているため、閉じている
      //   場合のみ開く — トグルボタンを無条件に押すと閉じてしまう）
      await page.getByTestId('tree-file').filter({ hasText: 'b.md' }).click();
      await expect(page.locator('#content h1')).toContainText('File B');
      const panel = page.locator('#comments-panel');
      if ((await panel.getAttribute('data-open')) !== 'true') {
        await page.locator('#btn-comments').click();
      }
      await expect(panel).toHaveAttribute('data-open', 'true');
      await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(0);

      // B にもコメントを追加
      await addCommentToActiveFile(page, 'comment on B');
      await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
      await expect(
        page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
      ).toContainText('comment on B');

      // A タブへ戻る。A のコメントだけが残っていて B のものは混ざらない。
      await page.locator('#file-tabs button', { hasText: 'a.md' }).click();
      await expect(page.locator('#content h1')).toContainText('File A');
      await expect(page.locator('[data-testid="comment-item"]')).toHaveCount(1);
      await expect(
        page.locator('[data-testid="comment-item"] [data-testid="c-text"]'),
      ).toContainText('comment on A');

      // ディスク上でも別ファイルに正しく分離して保存されている
      // （新store: reviewStore.ts のエンベロープ形式）
      await expect.poll(() => existsSync(aCommentsPath)).toBe(true);
      await expect.poll(() => existsSync(bCommentsPath)).toBe(true);
      const savedA = JSON.parse(readFileSync(aCommentsPath, 'utf-8')).comments;
      const savedB = JSON.parse(readFileSync(bCommentsPath, 'utf-8')).comments;
      expect(savedA).toHaveLength(1);
      expect(savedA[0].text).toBe('comment on A');
      expect(savedB).toHaveLength(1);
      expect(savedB[0].text).toBe('comment on B');
    } finally {
      rmSync(aCommentsPath, { force: true });
      rmSync(bCommentsPath, { force: true });
    }
  });
});
