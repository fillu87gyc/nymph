import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, pollUntilReady, test } from './fixtures.ts';

// 起動時に指定されたファイル/ディレクトリが存在しないケースを CLI レベルで
// 検証する。サーバーを起動する前に exit 1 で落ちることが要点。
//
// 標準ワーカー（6276+）・recent（6400+）・tree（6450+）・bookmarks（6500+）・
// instance delegation（6600+）と衝突しないポート帯を使う。
const BASE_PORT = 6700;

const NYMPH_ROOT = process.cwd();

let dir: string;
let mdPath: string;
let otherMdPath: string;
let xdgDir: string;
let port: number;

test.beforeAll(({ browserName: _browserName }, workerInfo) => {
  port = BASE_PORT + workerInfo.workerIndex;
  dir = join(NYMPH_ROOT, `tests/fixtures/cliargs-w${workerInfo.workerIndex}`);
  mdPath = join(dir, 'exists.md');
  otherMdPath = join(dir, 'other.md');
  xdgDir = join(dir, 'xdg');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(xdgDir, { recursive: true });
  writeFileSync(mdPath, '# Exists\n');
  writeFileSync(otherMdPath, '# Other\n');
});

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * 起動が失敗する前提で CLI を同期実行する。
 * 起動に成功してしまうとサーバーが常駐して戻ってこないため、
 * 保険として timeout を設定する（timeout 時は status が null になり、
 * 「exit 1 で落ちる」というアサーションが失敗して検知できる）。
 */
function runCli(args: string[]) {
  return spawnSync('bun', ['src/cli.ts', ...args], {
    cwd: NYMPH_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, XDG_DATA_HOME: xdgDir },
    timeout: 15000,
  });
}

test.describe('nymph 起動時の存在しないパス', () => {
  test('存在しないファイルを指定すると exit 1 でパスを示して落ちる', () => {
    const result = runCli(['--no-open', join(dir, 'nope.md')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('指定されたパスが存在しません');
    expect(result.stderr).toContain(join(dir, 'nope.md'));
    expect(result.stdout).not.toContain('http://localhost');
  });

  test('存在しないディレクトリを指定しても同じエラーになる', () => {
    const result = runCli(['--no-open', join(dir, 'no-such-dir')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('指定されたパスが存在しません');
    expect(result.stderr).toContain(join(dir, 'no-such-dir'));
  });

  test('存在するファイルと混ぜても、存在しない方を無視せずエラーにする', () => {
    const result = runCli(['--no-open', mdPath, join(dir, 'nope.md')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(dir, 'nope.md'));
    expect(result.stdout).not.toContain('http://localhost');
  });

  test('存在しないパスが複数あれば全て報告する', () => {
    const result = runCli([
      '--no-open',
      join(dir, 'nope1.md'),
      join(dir, 'nope2.md'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(dir, 'nope1.md'));
    expect(result.stderr).toContain(join(dir, 'nope2.md'));
  });

  test('どのファイルにも一致しない glob パターンもエラーになる', () => {
    const result = runCli(['--no-open', join(dir, '*.markdown')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('指定されたパスが存在しません');
    expect(result.stderr).toContain('*.markdown');
  });

  test('存在しない設定ファイルを dict build に渡すとファイル名を示して落ちる', () => {
    const result = runCli(['dict', 'build', '--config', join(dir, 'no.yml')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('設定ファイルが存在しません');
    expect(result.stderr).toContain(join(dir, 'no.yml'));
  });

  test('--config に値が無いとエラーになる', () => {
    const result = runCli(['dict', 'build', '--config']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--config には値を指定してください');
  });
});

test.describe('nymph 起動時の実在するパス', () => {
  let proc: ChildProcess | undefined;

  test.afterEach(async () => {
    if (!proc) return;
    proc.kill('SIGTERM');
    await Promise.race([
      new Promise<void>((r) => proc?.once('exit', () => r())),
      new Promise<void>((r) => setTimeout(r, 5000)),
    ]);
    proc = undefined;
  });

  test('シェルが展開しなかった glob は展開されてサーバーが起動する', async () => {
    // XDG_DATA_HOME を専用ディレクトリにして、他ワーカーの生存インスタンスへ
    // 委譲されないようにする（委譲されると監視対象の出力が出ない）。
    proc = spawn(
      'bun',
      ['src/cli.ts', '--no-open', '-p', String(port), join(dir, '*.md')],
      {
        cwd: NYMPH_ROOT,
        env: { ...process.env, XDG_DATA_HOME: xdgDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    proc.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });

    await pollUntilReady(`http://localhost:${port}/`);

    expect(stdout).toContain(mdPath);
    expect(stdout).toContain(otherMdPath);
  });
});
