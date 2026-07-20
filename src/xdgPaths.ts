import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * XDG Base Directory の data ディレクトリ（$XDG_DATA_HOME、未設定なら ~/.local/share）。
 * recent.ts / bookmarks.ts / instanceRegistry.ts / dict/consent.ts / reviewStore.ts が
 * 共通で使う。テスト時は XDG_DATA_HOME 環境変数で一時ディレクトリに切り替えられる。
 */
export function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
}

/** nymph 用データディレクトリ（$XDG_DATA_HOME/nymph）。 */
export function nymphDataDir(): string {
  return join(xdgDataHome(), 'nymph');
}
