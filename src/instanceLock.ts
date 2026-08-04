import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backendUrl, normalizeFrontendUrl } from './frontendUrl.ts';
import { SERVER_HOSTNAME } from './server.ts';

/**
 * 既存 nymph インスタンス検出のためのロックファイル計算とヘルスチェック。
 *
 * `nymph <file>` / `nymphx <file>` で既に開いているファイルを再度指定したとき、
 * 新規プロセス・新規ポートを起動せず、生きている既存サーバーへ委譲するために使う。
 */

/** CLI 起動時の対象パス群からロックファイルのパスを求める（cli.ts の書き込み先と対応） */
export function computeLockPath(
  paths: string[],
  rootDir: string | null,
): string | null {
  if (paths.length > 0) return `${paths[0]}.nymph-lock`;
  if (rootDir) return join(rootDir, '.nymph-lock');
  return null;
}

/** ロックファイルに書かれたポート番号を読む。無い/壊れている場合は null */
export function readLockPort(lockPath: string): number | null {
  if (!existsSync(lockPath)) return null;
  try {
    const raw = readFileSync(lockPath, 'utf-8').trim();
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return port;
  } catch {
    return null;
  }
}

/**
 * 指定ポートで応答しているのが本当に nymph サーバーかどうかを確認する。
 * 他アプリが同じポートを使い回している場合の誤検出を避けるため、
 * `/version` のレスポンス形状（`{ nymph: true }`）まで見る。
 */
export async function probeNymphServer(
  port: number,
  timeoutMs = 1000,
): Promise<boolean> {
  try {
    const res = await fetch(`http://${SERVER_HOSTNAME}:${port}/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { nymph?: boolean };
    return data?.nymph === true;
  } catch {
    return false;
  }
}

/**
 * ロックファイルから、生きている既存 nymph サーバーのポートを探す。
 * ロックが無い・stale（サーバー死亡や別アプリ）の場合は null を返す
 * （この場合 CLI は従来通り新規起動しロックを上書きする）。
 */
export async function findExistingServer(
  lockPath: string | null,
): Promise<number | null> {
  if (!lockPath) return null;
  const port = readLockPort(lockPath);
  if (port === null) return null;
  const alive = await probeNymphServer(port);
  return alive ? port : null;
}

/**
 * 既存インスタンスが案内しているフロント URL を `/version` から取得する。
 *
 * 委譲する側の CLI は「バックエンドのポート」しか知らないが、開発時は
 * フロントを配っているのが Vite dev server なので、そのポートを表示・
 * オープンしても目的の画面は出ない。実際にアセットを配っている URL は
 * 起動済みインスタンスだけが知っているため、そこから受け取る。
 * 応答が無い・古いバージョンで frontendUrl を返さない場合は、従来どおり
 * バックエンドの URL にフォールバックする。
 */
export async function fetchFrontendUrl(
  port: number,
  timeoutMs = 1000,
): Promise<string> {
  try {
    const res = await fetch(`http://${SERVER_HOSTNAME}:${port}/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return backendUrl(port);
    const data = (await res.json()) as { frontendUrl?: unknown };
    if (typeof data?.frontendUrl !== 'string') return backendUrl(port);
    return normalizeFrontendUrl(data.frontendUrl) ?? backendUrl(port);
  } catch {
    return backendUrl(port);
  }
}

/**
 * 既存サーバーへファイルを開くよう委譲する。
 * `/open-file` の許可チェック（isRecentPath / isBookmarkedPath / isUnderRoot）を
 * 通すため、呼び出し前に `recordRecent(paths)` を済ませておくこと。
 * 最後に指定したパスがアクティブタブになるよう `/active-file` も呼ぶ。
 */
export async function delegateOpenFiles(
  port: number,
  paths: string[],
): Promise<void> {
  for (const p of paths) {
    await fetch(`http://${SERVER_HOSTNAME}:${port}/open-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
  }
  if (paths.length > 0) {
    await fetch(`http://${SERVER_HOSTNAME}:${port}/active-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: paths[0] }),
    });
  }
}
