import { describe, expect, it } from 'vitest';
import {
  buildMatchItems,
  buildQuickOpenItems,
} from '../../src/client/lib/quickOpen.ts';
import type {
  BookmarkEntry,
  FileEntry,
  RecentEntry,
  SearchFileResult,
  TreeNode,
} from '../../src/client/types.ts';

const tabs: FileEntry[] = [{ path: '/w/a.md', name: 'a.md' }];

const recents: RecentEntry[] = [
  { path: '/w/a.md', name: 'a.md', dir: '/w', openedAt: '2026-01-01' },
  { path: '/x/old.md', name: 'old.md', dir: '/x', openedAt: '2026-01-01' },
];

const bookmarks: BookmarkEntry[] = [
  { path: '/y/fav.md', name: 'fav.md', dir: '/y', type: 'file', addedAt: '' },
  { path: '/y/dir', name: 'dir', dir: '/y', type: 'dir', addedAt: '' },
];

const tree: TreeNode[] = [
  {
    type: 'dir',
    name: 'docs',
    path: '/w/docs',
    children: [{ type: 'file', name: 'guide.md', path: '/w/docs/guide.md' }],
  },
  { type: 'file', name: 'a.md', path: '/w/a.md' },
];

describe('buildQuickOpenItems', () => {
  it('タブ → 最近 → ブックマーク → ツリーの順でマージし path で dedupe する', () => {
    const items = buildQuickOpenItems(tabs, recents, bookmarks, tree, '');
    expect(items.map((i) => i.path)).toEqual([
      '/w/a.md', // tab（recent・tree の重複は除外）
      '/x/old.md', // recent
      '/y/fav.md', // bookmark file
      '/y/dir', // bookmark dir
      '/w/docs/guide.md', // tree（ネスト含む flatten）
    ]);
  });

  it('dir ブックマークは type: dir として残る', () => {
    const items = buildQuickOpenItems([], [], bookmarks, [], '');
    expect(items.find((i) => i.path === '/y/dir')?.type).toBe('dir');
    expect(items.find((i) => i.path === '/y/fav.md')?.type).toBe('file');
  });

  it('クエリで部分一致フィルタする（大文字小文字無視・パスにも一致）', () => {
    const items = buildQuickOpenItems(tabs, recents, bookmarks, tree, 'GUIDE');
    expect(items.map((i) => i.path)).toEqual(['/w/docs/guide.md']);
    const byDir = buildQuickOpenItems(tabs, recents, bookmarks, tree, '/x/');
    expect(byDir.map((i) => i.path)).toEqual(['/x/old.md']);
  });

  it('一致なしなら空配列', () => {
    expect(buildQuickOpenItems(tabs, recents, bookmarks, tree, 'zzz')).toEqual(
      [],
    );
  });

  it('ドロップ由来の擬似タブ（__dropped__）は候補に出さない', () => {
    const items = buildQuickOpenItems(
      [{ path: '__dropped__', name: 'drop.md' }],
      [],
      [],
      [],
      '',
    );
    expect(items).toEqual([]);
  });
});

describe('buildMatchItems', () => {
  const results: SearchFileResult[] = [
    {
      path: '/w/a.md',
      name: 'a.md',
      nameMatch: false,
      matches: [
        { line: 3, text: 'foo bar', start: 0, end: 3, before: [], after: [] },
        { line: 8, text: 'baz foo', start: 4, end: 7, before: [], after: [] },
      ],
    },
    {
      path: '/w/name-only.md',
      name: 'name-only.md',
      nameMatch: true,
      matches: [],
    },
  ];

  it('1マッチ=1行に平坦化し、ファイル情報を持たせる', () => {
    const items = buildMatchItems(results);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ path: '/w/a.md', name: 'a.md', line: 3 });
    expect(items[1]).toMatchObject({ path: '/w/a.md', line: 8, start: 4 });
  });

  it('ファイル名のみ一致（matches 空）は出さない', () => {
    const items = buildMatchItems(results);
    expect(items.some((i) => i.path === '/w/name-only.md')).toBe(false);
  });
});
