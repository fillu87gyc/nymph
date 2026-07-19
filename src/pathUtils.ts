import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * パスを正規化する。
 *
 * `resolve()` で絶対パス化したうえで、実在するパスは `realpathSync()` で
 * シンボリックリンクも解決する。これにより同一ファイルを指す異なる表記
 * （symlink 経由 / 相対パス / `..` を含むパス等）を同一視できる。
 *
 * 実在しないパス（未作成ファイルの指定や realpath 失敗）は
 * `resolve()` の結果にフォールバックする。
 */
export function normalizePath(path: string): string {
  const abs = resolve(path);
  try {
    if (existsSync(abs)) return realpathSync(abs);
  } catch {
    /* realpath 失敗時は resolve 結果にフォールバック */
  }
  return abs;
}
