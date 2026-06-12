import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * 最近開いたファイルの履歴。
 * dict/consent.ts と同じく XDG_DATA_HOME（~/.local/share）に保存する。
 * テスト時は XDG_DATA_HOME 環境変数で一時ディレクトリに切り替えられる。
 */

export interface RecentFile {
  path: string;
  openedAt: string;
}

interface RecentJson {
  version: 1;
  entries: RecentFile[];
}

const MAX_RECENT = 20;

export function getRecentJsonPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'nymph', 'recent.json');
}

function loadEntries(): RecentFile[] {
  try {
    const path = getRecentJsonPath();
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as RecentJson;
    if (Array.isArray(parsed?.entries)) return parsed.entries;
  } catch {
    // ファイル破損や読み取りエラーは無視して空扱いにする
  }
  return [];
}

function saveEntries(entries: RecentFile[]): void {
  const path = getRecentJsonPath();
  mkdirSync(dirname(path), { recursive: true });
  const data: RecentJson = { version: 1, entries };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 開いたファイルを履歴の先頭に記録する（不存在・.md 以外はスキップ） */
export function recordRecent(paths: string[]): void {
  const valid = paths
    .map((p) => resolve(p))
    .filter((p) => p.endsWith('.md') && existsSync(p));
  if (valid.length === 0) return;

  const now = new Date().toISOString();
  let entries = loadEntries();
  // 後勝ちで先頭に積む（valid の末尾が最新になる）
  for (const p of valid) {
    entries = entries.filter((e) => e.path !== p);
    entries.unshift({ path: p, openedAt: now });
  }
  saveEntries(entries.slice(0, MAX_RECENT));
}

/** 表示用: ディスクに存在するものだけを新しい順で返す */
export function listRecent(): RecentFile[] {
  return loadEntries().filter((e) => existsSync(e.path));
}

/** 認可用: 記録上のパスかどうか（ディスクの存在は問わない） */
export function isRecentPath(path: string): boolean {
  return loadEntries().some((e) => e.path === path);
}
