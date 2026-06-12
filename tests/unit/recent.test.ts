import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getRecentJsonPath,
  isRecentPath,
  listRecent,
  recordRecent,
} from '../../src/recent.ts';

const TMP_DIR = join(tmpdir(), `nymph-recent-test-${process.pid}`);
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

describe('recordRecent / listRecent', () => {
  it('記録した順の逆（新しい順）で返す', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    recordRecent([a]);
    recordRecent([b]);
    expect(listRecent().map((e) => e.path)).toEqual([b, a]);
  });

  it('同じパスを再記録すると先頭に移動し重複しない', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    recordRecent([a]);
    recordRecent([b]);
    recordRecent([a]);
    expect(listRecent().map((e) => e.path)).toEqual([a, b]);
  });

  it('上限 20 件を超えた分は古いものから消える', () => {
    const paths: string[] = [];
    for (let i = 0; i < 25; i++) paths.push(makeMd(`f${i}.md`));
    for (const p of paths) recordRecent([p]);
    const listed = listRecent().map((e) => e.path);
    expect(listed).toHaveLength(20);
    expect(listed[0]).toBe(paths[24]);
    expect(listed).not.toContain(paths[0]);
  });

  it('listRecent はディスクから消えたファイルを除外する', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    recordRecent([a]);
    recordRecent([b]);
    rmSync(b);
    expect(listRecent().map((e) => e.path)).toEqual([a]);
  });

  it('存在しないパスと .md 以外は記録しない', () => {
    const txt = join(FILES_DIR, 'note.txt');
    writeFileSync(txt, 'hi');
    recordRecent([join(FILES_DIR, 'missing.md'), txt]);
    expect(listRecent()).toEqual([]);
  });

  it('openedAt に ISO 8601 文字列が入る', () => {
    const a = makeMd('a.md');
    recordRecent([a]);
    const entry = listRecent()[0];
    expect(new Date(entry.openedAt).toISOString()).toBe(entry.openedAt);
  });

  it('recent.json が存在しなくても空配列を返す', () => {
    expect(listRecent()).toEqual([]);
  });

  it('recent.json が壊れていても落ちずに空扱いで上書きできる', () => {
    mkdirSync(join(TMP_DIR, 'nymph'), { recursive: true });
    writeFileSync(getRecentJsonPath(), '{broken json');
    expect(listRecent()).toEqual([]);
    const a = makeMd('a.md');
    recordRecent([a]);
    expect(listRecent().map((e) => e.path)).toEqual([a]);
  });
});

describe('isRecentPath', () => {
  it('記録済みパスに true、未記録パスに false を返す', () => {
    const a = makeMd('a.md');
    recordRecent([a]);
    expect(isRecentPath(a)).toBe(true);
    expect(isRecentPath(join(FILES_DIR, 'other.md'))).toBe(false);
  });

  it('ディスクから消えても記録上のパスは true（認可用の生リスト照合）', () => {
    const a = makeMd('a.md');
    recordRecent([a]);
    rmSync(a);
    expect(isRecentPath(a)).toBe(true);
  });
});
