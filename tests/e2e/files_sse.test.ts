/**
 * タブ一覧の変化が SSE 経由でリロードなしに反映されることを検証する。
 *
 * `/files`（タブ一覧と選択中タブ）はクライアントからはフェッチでしか取れず、
 * SSE（`/watch`）が流していたのはファイル内容の変化と辞書更新だけだった。
 * そのため別プロセスの `nymph <file>` / `nymphx <file>` が既存インスタンスへ
 * 委譲してタブを増やしても（src/cli.ts の委譲経路 → `/open-file`）、開きっぱなし
 * の画面は SWR の revalidateOnFocus 頼み＝ウィンドウにフォーカスが戻るまで
 * タブが現れなかった。とくに nymphx は dev スクリプトが NYMPH_NO_OPEN=1 を
 * 付けるためブラウザを開き直すこともなく、「実行しても何も起きない」ように
 * 見えていた。
 *
 * instance_delegation.test.ts / instance_registry_delegation.test.ts が
 * 「委譲でサーバー側の状態が変わること」を検証しているのに対し、こちらは
 * 「その変化が開いている画面へ push されること」を検証する。
 *
 * 他の E2E ポート帯と衝突しないポート帯を使う。1 ワーカーにつき2ポート
 * （A/B）消費する。
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, pollUntilReady, test } from './fixtures.ts';

const BASE_PORT = 6850;

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

/** 別プロセスの `nymph <file>` を実行し、終了コードを返す。 */
async function runDelegatingCli(mdPath: string): Promise<number | null> {
  const proc = spawn('bun', ['src/cli.ts', '-p', String(portB), mdPath], {
    env: {
      ...process.env,
      NYMPH_NO_OPEN: '1',
      NYMPH_DICT_DIR: dictDir,
      XDG_DATA_HOME: xdgDir,
    },
    stdio: 'ignore',
  });
  return new Promise<number | null>((resolveExit) => {
    const timer = setTimeout(() => resolveExit(null), 15000);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
}

test.beforeAll(async ({ browserName: _browserName }, workerInfo) => {
  portA = BASE_PORT + workerInfo.workerIndex * 2;
  portB = portA + 1;
  dir = join(
    process.cwd(),
    `tests/fixtures/filessse-w${workerInfo.workerIndex}`,
  );
  mdPathA = join(dir, 'a.md');
  mdPathB = join(dir, 'b.md');
  xdgDir = join(dir, 'xdg');
  dictDir = join(dir, 'dict');

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(xdgDir, { recursive: true });
  mkdirSync(dictDir, { recursive: true });
  writeFileSync(mdPathA, '# A\n\nAlpha document.\n');
  writeFileSync(mdPathB, '# B\n\nBravo document.\n');

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

test.describe('タブ一覧の変化の SSE 反映', () => {
  test('別プロセスの委譲で開かれたファイルが、リロードなしに新しいタブとして現れてアクティブになる', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${portA}/`);
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toContainText('A', { timeout: 5000 });
    // 1 ファイルだけなのでタブ行はまだ出ていない
    await expect(page.locator('#file-tabs')).not.toBeVisible();

    // 別ターミナルで `nymph b.md`（nymphx 相当）を実行したと想定する。
    // 委譲されるだけなので、この画面には何のイベントも起きない
    // （ブラウザは開き直されず、フォーカスも動かない）。
    expect(await runDelegatingCli(mdPathB)).toBe(0);

    // リロードもフォーカス操作もなしにタブ行が現れ、b.md が選択される
    const tabB = page.locator('#file-tabs button', {
      hasText: basename(mdPathB),
    });
    await expect(tabB).toBeVisible({ timeout: 5000 });
    await expect(tabB).toHaveAttribute('data-active', 'true');
    await expect(
      page.locator('#file-tabs button', { hasText: basename(mdPathA) }),
    ).toBeVisible();

    // タブだけでなく本文も切り替わっている
    await expect(
      page.locator('#content [data-testid="md-block"]').first(),
    ).toContainText('B', { timeout: 5000 });
  });

  test('別ウィンドウでのタブ切り替えが、もう一方の画面にもリロードなしに反映される', async ({
    page,
    context,
  }) => {
    // 前のテストの結果に依存しないよう、b.md が開かれた状態を自分で作る
    // （既に開いていればタブは増えない）。
    await page.request.post(`http://localhost:${portA}/bookmarks/toggle`, {
      data: { path: mdPathB, type: 'file' },
    });
    await page.request.post(`http://localhost:${portA}/open-file`, {
      data: { path: mdPathB },
    });

    await page.goto(`http://localhost:${portA}/`);
    const tabA = page.locator('#file-tabs button', {
      hasText: basename(mdPathA),
    });
    await expect(tabA).toBeVisible({ timeout: 5000 });
    await expect(tabA).toHaveAttribute('data-active', 'false');

    // 同じサーバーを見ている2枚目の画面でタブを切り替える
    const other = await context.newPage();
    try {
      await other.goto(`http://localhost:${portA}/`);
      const otherTabA = other.locator('#file-tabs button', {
        hasText: basename(mdPathA),
      });
      await expect(otherTabA).toBeVisible({ timeout: 5000 });
      await otherTabA.click();
      await expect(otherTabA).toHaveAttribute('data-active', 'true');

      // 1枚目もリロードなしに追従する
      await expect(tabA).toHaveAttribute('data-active', 'true', {
        timeout: 5000,
      });
      await expect(
        page.locator('#content [data-testid="md-block"]').first(),
      ).toContainText('A', { timeout: 5000 });
    } finally {
      await other.close();
    }
  });
});
