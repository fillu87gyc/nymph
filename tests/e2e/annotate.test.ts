/**
 * `nymph <file> --annotate <out.md>` と `nymph export <file>` の E2E。
 *
 * CLI を実際に走らせて出力を確かめ、書き戻した Markdown は nymph 本体で
 * 開いて「引用として正しく描かれる」ところまで見る（引用の前後に空行が
 * 無いと本文が引用へ吸われる——文字列比較だけでは見つけにくい壊れ方なので、
 * 実際にレンダリングさせて確かめる）。
 */

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Comment } from '../../src/client/types.ts';
import { reviewKey } from '../../src/reviewStore.ts';
import { expect, pollUntilReady, test } from './fixtures.ts';

const NYMPH_ROOT = process.cwd();

// 他の専用サーバー（6276+/6400+/6450+/6500+/6550+/6600+/6650+/6700+/6750+）と
// 衝突しないポート帯。
const ANNOTATE_BASE_PORT = 6800;

const DOC = `# レビュー対象

これは本文の段落です。

## コード

\`\`\`ts
const answer = 42;
\`\`\`

最後の段落。
`;

const COMMENTS: Comment[] = [
  {
    id: 'c_open01',
    lineStart: 3,
    lineEnd: 3,
    block_type: 'paragraph',
    context: 'これは本文の段落です。',
    text: '主語が曖昧です',
    round: 2,
  },
  {
    id: 'c_code01',
    lineStart: 7,
    lineEnd: 9,
    block_type: 'code',
    context: { lang: 'ts', code: 'const answer = 42;' },
    text: 'マジックナンバーに名前を',
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
let csvPath: string;
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
  dir = join(NYMPH_ROOT, `tests/fixtures/annotate-w${workerInfo.workerIndex}`);
  mdPath = join(dir, 'report.md');
  outPath = join(dir, 'review.md');
  csvPath = join(dir, 'review.csv');
  xdgDir = join(dir, 'xdg');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(mdPath, DOC);

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

test.describe('nymph --annotate', () => {
  test('CLI が Markdown を書き出して 0 で終わる', () => {
    const result = runCli([mdPath, '--annotate', outPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(outPath);
    expect(result.stdout).toContain(
      'コメント      4 件（未解決 2 / 削除済 1 / 解決済 1）',
    );

    const written = readFileSync(outPath, 'utf-8');
    expect(written).toContain('> [nymph] 未解決 · L3 · ラウンド 2');
    expect(written).toContain('> 主語が曖昧です');
  });

  test('本文はそのまま残り、コメントが対象ブロックの直後に入る', () => {
    expect(runCli([mdPath, '--annotate', outPath]).status).toBe(0);
    const written = readFileSync(outPath, 'utf-8');

    expect(written).toContain(
      'これは本文の段落です。\n\n> [nymph] 未解決 · L3',
    );
    // コードブロックはフェンスを閉じたあとに引用が入る
    expect(written).toContain('```\n\n> [nymph] 未解決 · L7-9');
    // 対象が消えた指摘は末尾セクションへ
    const tail = written.slice(written.indexOf('本文に紐づかないコメント'));
    expect(tail).toContain('対象が消えた指摘');
  });

  test('元ファイルは書き換えない', () => {
    expect(runCli([mdPath, '--annotate', outPath]).status).toBe(0);
    expect(readFileSync(mdPath, 'utf-8')).toBe(DOC);
  });

  test('--annotate-open で解決済みを外す', () => {
    const result = runCli([mdPath, '--annotate', outPath, '--annotate-open']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('除外          解決済 1 件');

    const written = readFileSync(outPath, 'utf-8');
    expect(written).not.toContain('見出しの表記ゆれは直しました');
    expect(written).toContain('主語が曖昧です');
  });

  test('--annotate はサーバーを起動せず既存インスタンスにも委譲しない', () => {
    const result = runCli([mdPath, '--annotate', outPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('http://localhost');
    expect(result.stdout).not.toContain('既存のインスタンス');
  });

  test('元ファイルへの上書きはエラーで落ちる', () => {
    const result = runCli([mdPath, '--annotate', mdPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('書き戻し先が元ファイルと同じです');
    expect(readFileSync(mdPath, 'utf-8')).toBe(DOC);
  });

  test('ファイルを指定しないとエラーで落ちる', () => {
    const result = runCli(['--annotate', outPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.md ファイルを1つ指定してください');
  });

  test('ファイルを複数指定するとエラーで落ちる', () => {
    const second = join(dir, 'other.md');
    writeFileSync(second, '# もう1つ\n');
    const result = runCli([mdPath, second, '--annotate', outPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--annotate で扱えるファイルは1つだけです');
  });

  test('--annotate に値が無いとエラーで落ちる', () => {
    const result = runCli([mdPath, '--annotate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--annotate には値を指定してください');
  });

  test('--annotate-open を単独で指定するとエラーで落ちる', () => {
    const result = runCli([mdPath, '--annotate-open']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--annotate と一緒に指定してください');
  });

  test('--export と同時に指定するとエラーで落ちる', () => {
    const result = runCli([
      mdPath,
      '--export',
      join(dir, 'x.html'),
      '--annotate',
      outPath,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('同時に指定できません');
  });
});

test.describe('書き戻した Markdown を nymph で開く', () => {
  let proc: ChildProcess;
  let port: number;

  test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
    port = ANNOTATE_BASE_PORT + workerInfo.workerIndex;
    expect(runCli([mdPath, '--annotate', outPath]).status).toBe(0);

    proc = spawn('bun', ['src/cli.ts', '-p', String(port), outPath], {
      cwd: NYMPH_ROOT,
      env: {
        ...process.env,
        NYMPH_NO_OPEN: '1',
        NYMPH_DICT_DIR: join(dir, 'dict'),
        XDG_DATA_HOME: join(dir, 'xdg-view'),
      },
      stdio: 'ignore',
    });
    await pollUntilReady(`http://localhost:${port}/`);
  });

  test.afterAll(async () => {
    proc.kill('SIGTERM');
    await new Promise<void>((r) => {
      proc.once('exit', () => r());
      setTimeout(r, 5000);
    });
  });

  test('コメントは引用として描かれ、本文を巻き込まない', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(
      page.getByRole('heading', { name: 'レビュー対象' }),
    ).toBeVisible();

    // 引用ブロックの中に指摘が出る
    const quote = page.locator('blockquote', {
      hasText: '主語が曖昧です',
    });
    await expect(quote).toBeVisible();
    await expect(quote).toContainText('[nymph] 未解決 · L3 · ラウンド 2');

    // 直前の本文・直後の見出しは引用の外に残っている
    await expect(
      page.locator('p', { hasText: 'これは本文の段落です。' }).first(),
    ).toBeVisible();
    await expect(quote).not.toContainText('これは本文の段落です。');
    await expect(page.getByRole('heading', { name: 'コード' })).toBeVisible();

    // 末尾セクションも見出しとして描かれる
    await expect(
      page.getByRole('heading', { name: /本文に紐づかないコメント/ }),
    ).toBeVisible();
  });
});

test.describe('nymph export（CSV）', () => {
  test('-o でファイルに書き出す', () => {
    const result = runCli(['export', mdPath, '-o', csvPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(csvPath);
    expect(result.stdout).toContain('コメント      4 件');

    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'file,id,status,line_start,line_end,block_type,round,created_at,target,comment',
    );
    expect(lines).toHaveLength(5);
    expect(csv).toContain('report.md,c_open01,open,3,3,paragraph,2,,');
    expect(csv).toContain('c_done01,resolved');
    expect(csv).toContain('c_gone01,deleted');
  });

  test('-o を省くと標準出力へ流す（他の出力を混ぜない）', () => {
    const result = runCli(['export', mdPath]);
    expect(result.status).toBe(0);
    expect(result.stdout.startsWith('file,id,status')).toBe(true);
    expect(result.stdout).not.toContain('元ファイル');
  });

  test('--bom で BOM を付ける', () => {
    const result = runCli(['export', mdPath, '--bom', '-o', csvPath]);
    expect(result.status).toBe(0);
    expect(readFileSync(csvPath, 'utf-8').charCodeAt(0)).toBe(0xfeff);
  });

  test('元ファイルは書き換えない', () => {
    expect(runCli(['export', mdPath, '-o', csvPath]).status).toBe(0);
    expect(readFileSync(mdPath, 'utf-8')).toBe(DOC);
  });

  test('ファイルを指定しないとエラーで落ちる', () => {
    const result = runCli(['export']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.md ファイルを1つ指定してください');
  });

  test('存在しないファイルはエラーで落ちる', () => {
    const result = runCli(['export', join(dir, 'nope.md')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('指定されたパスが存在しません');
  });

  test('不明なオプションはエラーで落ちる', () => {
    const result = runCli(['export', mdPath, '--nope']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('不明なオプション');
  });

  test('--help でサブコマンドのヘルプを出す', () => {
    const result = runCli(['export', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('使い方: nymph export');
    expect(result.stdout).toContain('--bom');
  });

  test('nymph --help からも辿れる', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--annotate <出力先>');
    expect(result.stdout).toContain('nymph export <ファイル>');
  });
});
