import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, pollUntilReady, test } from './fixtures.ts';

// nymph a.md を起動中に、無関係な nymph b.md を実行したとき、
// 新規プロセス・新規ポートを起動せず既存インスタンスの開いているファイル
// 一覧に b.md を追加することを検証する。
//
// instance_delegation.test.ts はロックファイルが一致するケース（同じファイル
// の再実行）を検証しているのに対し、こちらはロックが無関係でも
// instanceRegistry 経由で他の生きたインスタンスを見つけて委譲するケースを
// 検証する（ロジック自体の単体検証は tests/unit/instanceRegistry.test.ts）。
//
// 他の E2E ポート帯と衝突しないポート帯を使う。1 ワーカーにつき2ポート
// （A/B）消費する。
const BASE_PORT = 6650;

let procA: ChildProcess;
let portA: number;
let portB: number;
let dir: string;
let mdPathA: string;
let mdPathB: string;
let xdgDir: string;
let dictDir: string;

async function stopProc(proc: ChildProcess) {
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((r) => proc.once('exit', r)),
    new Promise<void>((r) => setTimeout(r, 5000)),
  ]);
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  portA = BASE_PORT + workerInfo.workerIndex * 2;
  portB = portA + 1;
  dir = join(
    process.cwd(),
    `tests/fixtures/instreg-w${workerInfo.workerIndex}`,
  );
  mdPathA = join(dir, 'a.md');
  mdPathB = join(dir, 'b.md');
  xdgDir = join(dir, 'xdg');
  dictDir = join(dir, 'dict');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(xdgDir, { recursive: true });
  mkdirSync(dictDir, { recursive: true });
  writeFileSync(mdPathA, '# A\n');
  writeFileSync(mdPathB, '# B\n');

  procA = spawn('bun', ['src/cli.ts', '-p', String(portA), mdPathA], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: dictDir,
      XDG_DATA_HOME: xdgDir,
    },
    stdio: 'ignore',
  });
  await pollUntilReady(`http://localhost:${portA}/`);
});

test.afterAll(async () => {
  await stopProc(procA);
  rmSync(dir, { recursive: true, force: true });
});

test.describe('無関係なファイルを開いたときの既存インスタンスへの委譲', () => {
  test('起動中のインスタンスと無関係な nymph <file> を実行しても新規プロセスを立てず既存インスタンスのファイル一覧に加える', async ({
    page,
  }) => {
    const registryPath = join(xdgDir, 'nymph', 'instances.json');
    const registryBefore = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(registryBefore.ports).toContain(portA);

    const procB = spawn('bun', ['src/cli.ts', '-p', String(portB), mdPathB], {
      env: {
        ...process.env,
        NYMPH_NO_OPEN: '1',
        NYMPH_DICT_DIR: dictDir,
        XDG_DATA_HOME: xdgDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    procB.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });

    const exitCode = await new Promise<number | null>((resolveExit) => {
      const timer = setTimeout(() => resolveExit(null), 15000);
      procB.once('exit', (code) => {
        clearTimeout(timer);
        resolveExit(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('既存のインスタンスで開きます');

    // B は自分のポートで listen していない（新規サーバーを起動していない証拠）
    await expect(async () => {
      await fetch(`http://localhost:${portB}/`, {
        signal: AbortSignal.timeout(300),
      });
    }).rejects.toThrow();

    // A 側に b.md が追加され、アクティブタブになっている
    const filesAfter = await (
      await page.request.get(`http://localhost:${portA}/files`)
    ).json();
    const paths = filesAfter.files.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining([mdPathA, mdPathB]));
    expect(filesAfter.activeFile).toBe(mdPathB);

    // 次回 b.md 単独で開いたときに直接見つけられるようロックが書かれる
    const lockPathB = `${mdPathB}.nymph-lock`;
    expect(readFileSync(lockPathB, 'utf-8').trim()).toBe(String(portA));
  });
});
