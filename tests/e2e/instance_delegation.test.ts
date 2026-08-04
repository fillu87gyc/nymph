import { type ChildProcess, spawn } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, pollUntilReady, test } from './fixtures.ts';

// 既存の nymph インスタンスが同じファイルを既に開いているとき、
// `nymph <file>` / `nymphx <file>` を再実行しても新規プロセス・新規ポートを
// 起動せず、既存インスタンスへ委譲して終了することを検証する。
//
// 実プロセスを2つ起動して検証する統合テスト（ロジック自体の単体検証は
// tests/unit/instanceLock.test.ts、パス正規化は tests/unit/pathUtils.test.ts /
// tests/unit/recent.test.ts / tests/unit/bookmarks.test.ts を参照）。
//
// 標準ワーカー（6276+）・recent（6400+）・tree（6450+）・bookmarks（6500+）
// と衝突しないポート帯を使う。1 ワーカーにつき2ポート（A/B）消費する。
const BASE_PORT = 6600;

let procA: ChildProcess;
let portA: number;
let portB: number;
let dir: string;
let mdPath: string;
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
    `tests/fixtures/instlock-w${workerInfo.workerIndex}`,
  );
  mdPath = join(dir, 'target.md');
  xdgDir = join(dir, 'xdg');
  dictDir = join(dir, 'dict');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(xdgDir, { recursive: true });
  mkdirSync(dictDir, { recursive: true });
  writeFileSync(mdPath, '# Target\n');

  procA = spawn('bun', ['src/cli.ts', '-p', String(portA), mdPath], {
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

test.describe('既存インスタンスへの委譲', () => {
  test('同じファイルを対象に nymph を再実行すると新規プロセスを立てず既存インスタンスに委譲する', async ({
    page,
  }) => {
    const lockPath = `${mdPath}.nymph-lock`;
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(portA));

    const filesBefore = await (
      await page.request.get(`http://localhost:${portA}/files`)
    ).json();
    expect(filesBefore.files).toHaveLength(1);

    const procB = spawn('bun', ['src/cli.ts', '-p', String(portB), mdPath], {
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

    // 委譲するプロセスは自前のサーバーを起動せずすぐ終了するはず
    const exitCode = await new Promise<number | null>((resolveExit) => {
      const timer = setTimeout(() => resolveExit(null), 15000);
      procB.once('exit', (code) => {
        clearTimeout(timer);
        resolveExit(code);
      });
    });

    expect(exitCode).toBe(0);
    // dev（Vite dev server）でない通常起動では、バックエンド自身がアセットを
    // 配るので案内 URL はそのポートのまま。API 行も出さない
    // （dev 時の挙動は tests/e2e/frontend_url.test.ts）。
    expect(stdout).toContain(
      `既存のインスタンスで開きます   http://localhost:${portA}`,
    );
    expect(stdout).not.toContain('API     ');

    // B は自分のポートで listen していない（新規サーバーを起動していない証拠）
    await expect(async () => {
      await fetch(`http://localhost:${portB}/`, {
        signal: AbortSignal.timeout(300),
      });
    }).rejects.toThrow();

    // ロックファイルは A のポートのまま（委譲時は上書きしない）
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(portA));

    // A 側は重複タブを作らず、対象ファイルがアクティブなまま
    const filesAfter = await (
      await page.request.get(`http://localhost:${portA}/files`)
    ).json();
    expect(filesAfter.files).toHaveLength(1);
    expect(filesAfter.activeFile).toBe(mdPath);
  });

  test('symlink 経由で同じファイルを /open-file しても重複タブにならず既存タブがアクティブになる', async ({
    page,
  }) => {
    const linkPath = join(dir, 'link-to-target.md');
    rmSync(linkPath, { force: true });
    symlinkSync(mdPath, linkPath);

    try {
      const res = await page.request.post(
        `http://localhost:${portA}/open-file`,
        { data: { path: linkPath } },
      );
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.files).toHaveLength(1);
      expect(data.files[0].path).toBe(mdPath);
      expect(data.activeFile).toBe(mdPath);
    } finally {
      rmSync(linkPath, { force: true });
    }
  });
});
