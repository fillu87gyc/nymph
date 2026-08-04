import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pollUntilReady } from './fixtures.ts';

// CLI が案内する URL は「アセットを実際に配っている場所」でなければならない。
//
// 本番ではバックエンド自身が dist/ を配るので両者は同じだが、`bun run dev` では
// Vite dev server がフロントを配っており、バックエンドのポート（:6276）を開いても
// 開発中の画面は出ない。この差を NYMPH_FRONTEND_URL で吸収していることを、
// 起動時・既存インスタンスへの委譲時の両方について実プロセスで検証する。
//
// 他テスト（6276+ / 6400 recent / 6450 tree / 6500 bookmarks / 6550 quickopen /
// 6600 delegation / 6650 registry / 6700 search）と衝突しないポート帯を使う。
// 1 ワーカーにつき3ポート（A / 委譲側 B / フロント想定）消費する。
const BASE_PORT = 6750;

let procA: ChildProcess;
let stdoutA = '';
let portA: number;
let portB: number;
let frontendUrl: string;
let dir: string;
let mdPath: string;

async function stopProc(proc: ChildProcess) {
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((r) => proc.once('exit', r)),
    new Promise<void>((r) => setTimeout(r, 5000)),
  ]);
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  portA = BASE_PORT + workerInfo.workerIndex * 3;
  portB = portA + 1;
  // 実際に listen する必要は無い（CLI が案内する文字列が対象）。
  // dev の Vite dev server に相当する URL としてだけ使う。
  frontendUrl = `http://localhost:${portA + 2}`;

  dir = join(
    process.cwd(),
    `tests/fixtures/fronturl-w${workerInfo.workerIndex}`,
  );
  mdPath = join(dir, 'target.md');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'xdg'), { recursive: true });
  mkdirSync(join(dir, 'dict'), { recursive: true });
  writeFileSync(mdPath, '# Target\n');

  procA = spawn('bun', ['src/cli.ts', '-p', String(portA), mdPath], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_FRONTEND_URL: frontendUrl,
      NYMPH_DICT_DIR: join(dir, 'dict'),
      XDG_DATA_HOME: join(dir, 'xdg'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procA.stdout?.on('data', (chunk) => {
    stdoutA += String(chunk);
  });
  await pollUntilReady(`http://localhost:${portA}/version`);
});

test.afterAll(async () => {
  await stopProc(procA);
  rmSync(dir, { recursive: true, force: true });
});

test.describe('フロント URL の案内', () => {
  test('起動時はフロント URL を主に出し、バックエンドは API 行に添える', async () => {
    await expect.poll(() => stdoutA).toContain('nymph   ');

    expect(stdoutA).toContain(`nymph   ${frontendUrl}`);
    expect(stdoutA).toContain(`API     http://localhost:${portA}`);
    // バックエンドのポートが主役の URL として出ていないこと
    expect(stdoutA).not.toContain(`nymph   http://localhost:${portA}`);
  });

  test('/version は自身のフロント URL を公開する', async () => {
    const res = await fetch(`http://localhost:${portA}/version`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ nymph: true, frontendUrl });
  });

  test('既存インスタンスへ委譲するときもフロント URL を案内する', async () => {
    const procB = spawn('bun', ['src/cli.ts', '-p', String(portB), mdPath], {
      env: {
        ...process.env,
        NYMPH_NO_OPEN: '1',
        // 委譲する側は dev の環境変数を持っていない（別端末から `nymph <file>`
        // を叩いたケース）。それでもフロント URL は既存インスタンスから引ける。
        NYMPH_FRONTEND_URL: '',
        NYMPH_DICT_DIR: join(dir, 'dict'),
        XDG_DATA_HOME: join(dir, 'xdg'),
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
    expect(stdout).toContain(`既存のインスタンスで開きます   ${frontendUrl}`);
    expect(stdout).toContain(`API     http://localhost:${portA}`);
    expect(stdout).not.toContain(
      `既存のインスタンスで開きます   http://localhost:${portA}`,
    );
  });
});
