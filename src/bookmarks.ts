import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * ブックマーク（ファイル・ディレクトリ両対応）。
 * recent.ts と同じく XDG_DATA_HOME（~/.local/share）に保存する。
 * 明示的に登録するものなので件数上限は設けない。
 */

export interface BookmarkEntry {
  path: string;
  type: 'file' | 'dir';
  addedAt: string;
}

interface BookmarksJson {
  version: 1;
  entries: BookmarkEntry[];
}

export function getBookmarksJsonPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, 'nymph', 'bookmarks.json');
}

function loadEntries(): BookmarkEntry[] {
  try {
    const path = getBookmarksJsonPath();
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as BookmarksJson;
    if (Array.isArray(parsed?.entries)) return parsed.entries;
  } catch {
    // ファイル破損や読み取りエラーは無視して空扱いにする
  }
  return [];
}

function saveEntries(entries: BookmarkEntry[]): void {
  const path = getBookmarksJsonPath();
  mkdirSync(dirname(path), { recursive: true });
  const data: BookmarksJson = { version: 1, entries };
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 登録/解除をトグルする。戻り値はトグル後に登録されているかどうか */
export function toggleBookmark(path: string, type: 'file' | 'dir'): boolean {
  const entries = loadEntries();
  const without = entries.filter((e) => e.path !== path);
  if (without.length < entries.length) {
    saveEntries(without);
    return false;
  }
  entries.push({ path, type, addedAt: new Date().toISOString() });
  saveEntries(entries);
  return true;
}

/** 表示用: ディスクに存在するものだけを登録順で返す */
export function listBookmarks(): BookmarkEntry[] {
  return loadEntries().filter((e) => existsSync(e.path));
}

/** 認可用: file としてブックマーク済みのパスかどうか（dir は対象外） */
export function isBookmarkedPath(path: string): boolean {
  return loadEntries().some((e) => e.type === 'file' && e.path === path);
}
