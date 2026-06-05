import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { NaiadYml } from './schema.ts';

/**
 * direnv と同じく XDG_DATA_HOME（~/.local/share）に保存する。
 * 承認済みハッシュはアプリが書くデータであり設定ファイルではない。
 * テスト時は XDG_DATA_HOME 環境変数で一時ディレクトリに切り替えられる。
 */
function getAcceptedHashesPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'naiad', 'accepted_hashes.json');
}

/**
 * config.yml の全ソースコマンドを正規化してSHA256ハッシュを返す。
 *
 * ソースをname順にソートすることで順序変更に対してロバストにする。
 * ソース名・コマンド引数が1バイトでも変わればハッシュが変わる。
 */
export function computeCommandsHash(config: NaiadYml): string {
  const sorted = [...config.sources].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  // \x1f = Unit Separator、\x1e = Record Separator（制御文字で曖昧性を排除）
  const canonical = sorted
    .map((s) => [s.name, ...(s.fetch?.cmd ?? [])].join('\x1f'))
    .join('\x1e');
  return (
    'sha256:' + createHash('sha256').update(canonical, 'utf-8').digest('hex')
  );
}

function loadAcceptedHashes(): Set<string> {
  try {
    const path = getAcceptedHashesPath();
    if (!existsSync(path)) return new Set();
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    // ファイル破損や読み取りエラーは無視して空扱いにする
  }
  return new Set();
}

export function isCommandHashAccepted(hash: string): boolean {
  return loadAcceptedHashes().has(hash);
}

export function saveAcceptedHash(hash: string): void {
  const path = getAcceptedHashesPath();
  const hashes = loadAcceptedHashes();
  hashes.add(hash);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...hashes], null, 2) + '\n', 'utf-8');
}
