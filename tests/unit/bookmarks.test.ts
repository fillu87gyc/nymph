import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getBookmarksJsonPath,
  isBookmarkedPath,
  listBookmarks,
  toggleBookmark,
} from '../../src/bookmarks.ts';

const TMP_DIR = join(tmpdir(), `nymph-bookmarks-test-${process.pid}`);
const FILES_DIR = join(TMP_DIR, 'files');

function makeMd(name: string): string {
  const p = join(FILES_DIR, name);
  writeFileSync(p, `# ${name}\n`);
  return p;
}

// テスト専用の XDG_DATA_HOME に切り替えて本物の ~/.local/share を汚染しない
beforeEach(() => {
  mkdirSync(FILES_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_DATA_HOME;
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('toggleBookmark / listBookmarks', () => {
  it('追加 → 削除のトグルが往復する', () => {
    const a = makeMd('a.md');
    expect(toggleBookmark(a, 'file')).toBe(true);
    expect(listBookmarks().map((e) => e.path)).toEqual([a]);
    expect(toggleBookmark(a, 'file')).toBe(false);
    expect(listBookmarks()).toEqual([]);
  });

  it('file と dir を混在して登録できる', () => {
    const a = makeMd('a.md');
    toggleBookmark(a, 'file');
    toggleBookmark(FILES_DIR, 'dir');
    const entries = listBookmarks();
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      [a, 'file'],
      [FILES_DIR, 'dir'],
    ]);
  });

  it('listBookmarks はディスクから消えたパスを除外する', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    toggleBookmark(a, 'file');
    toggleBookmark(b, 'file');
    rmSync(b);
    expect(listBookmarks().map((e) => e.path)).toEqual([a]);
  });

  it('bookmarks.json が壊れていても落ちずに空扱いで上書きできる', () => {
    mkdirSync(join(TMP_DIR, 'nymph'), { recursive: true });
    writeFileSync(getBookmarksJsonPath(), '{broken');
    expect(listBookmarks()).toEqual([]);
    const a = makeMd('a.md');
    toggleBookmark(a, 'file');
    expect(listBookmarks().map((e) => e.path)).toEqual([a]);
  });

  it('addedAt に ISO 8601 文字列が入る', () => {
    const a = makeMd('a.md');
    toggleBookmark(a, 'file');
    const entry = listBookmarks()[0];
    expect(new Date(entry.addedAt).toISOString()).toBe(entry.addedAt);
  });
});

describe('isBookmarkedPath', () => {
  it('登録済み file パスに true、未登録に false', () => {
    const a = makeMd('a.md');
    toggleBookmark(a, 'file');
    expect(isBookmarkedPath(a)).toBe(true);
    expect(isBookmarkedPath(join(FILES_DIR, 'other.md'))).toBe(false);
  });

  it('dir ブックマークには false（/open-file の認可は file のみ）', () => {
    toggleBookmark(FILES_DIR, 'dir');
    expect(isBookmarkedPath(FILES_DIR)).toBe(false);
  });
});
