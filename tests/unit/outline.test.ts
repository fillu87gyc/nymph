import { describe, expect, test } from 'vitest';
import {
  computeOutlineStats,
  loadOutlineBadgeMode,
  type OutlineBadgeMode,
  resolveEffectiveBadgeMode,
  saveOutlineBadgeMode,
} from '../../src/client/lib/outline.ts';
import type { TocItem } from '../../src/client/lib/toc.ts';
import type {
  Comment,
  DiffLine,
  DiffResponse,
} from '../../src/client/types.ts';

function makeItems(): TocItem[] {
  return [
    { key: 'toc-0', level: 1, text: 'Sample', lineStart: 1 },
    { key: 'toc-1', level: 2, text: 'Section', lineStart: 10 },
    { key: 'toc-2', level: 2, text: 'Diagram', lineStart: 18 },
  ];
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    lineStart: 1,
    lineEnd: 1,
    block_type: 'paragraph',
    context: '',
    text: 'comment',
    ...overrides,
  };
}

function makeDiffLine(overrides: Partial<DiffLine> = {}): DiffLine {
  return {
    n: null,
    o: null,
    type: 'equal',
    content: '',
    g: null,
    ...overrides,
  };
}

describe('loadOutlineBadgeMode / saveOutlineBadgeMode', () => {
  test('未設定なら既定値 comments', () => {
    localStorage.clear();
    expect(loadOutlineBadgeMode()).toBe('comments');
  });

  test('保存した値を読み戻せる', () => {
    saveOutlineBadgeMode('both');
    expect(loadOutlineBadgeMode()).toBe('both');
  });

  test('不正な値は既定値にフォールバックする', () => {
    localStorage.setItem('nymph-outline-badge-mode', 'invalid');
    expect(loadOutlineBadgeMode()).toBe('comments');
  });
});

describe('resolveEffectiveBadgeMode', () => {
  test('diff モードでチェックポイント未設定なら comments にフォールバック', () => {
    expect(resolveEffectiveBadgeMode('diff', false)).toBe('comments');
  });

  test('diff モードでチェックポイント設定済みならそのまま', () => {
    expect(resolveEffectiveBadgeMode('diff', true)).toBe('diff');
  });

  test.each([
    'off',
    'comments',
    'both',
  ] as OutlineBadgeMode[])('%s はチェックポイント有無に関わらずそのまま', (mode) => {
    expect(resolveEffectiveBadgeMode(mode, false)).toBe(mode);
    expect(resolveEffectiveBadgeMode(mode, true)).toBe(mode);
  });
});

describe('computeOutlineStats', () => {
  test('見出しがなければ空の Map', () => {
    const stats = computeOutlineStats([], [], new Set(), null);
    expect(stats.size).toBe(0);
  });

  test('コメントは対象行を含む見出しセクションへ帰属する', () => {
    const items = makeItems();
    const comments = [
      makeComment({ id: 1, lineStart: 5 }), // Sample 配下
      makeComment({ id: 2, lineStart: 12 }), // Section 配下
      makeComment({ id: 3, lineStart: 20 }), // Diagram 配下
    ];
    const stats = computeOutlineStats(items, comments, new Set(), null);
    expect(stats.get('toc-0')?.openComments).toBe(1);
    expect(stats.get('toc-1')?.openComments).toBe(1);
    expect(stats.get('toc-2')?.openComments).toBe(1);
  });

  test('見出し行ちょうどのコメントはその見出しに属する', () => {
    const items = makeItems();
    const comments = [
      makeComment({ id: 1, lineStart: 10 }), // Section の見出し行
      makeComment({ id: 2, lineStart: 9 }), // 直前は Sample 配下
    ];
    const stats = computeOutlineStats(items, comments, new Set(), null);
    expect(stats.get('toc-1')?.openComments).toBe(1);
    expect(stats.get('toc-0')?.openComments).toBe(1);
  });

  test('見出しが多くても各コメントが正しいセクションへ入る', () => {
    const items: TocItem[] = Array.from({ length: 16 }, (_, i) => ({
      key: `toc-${i}`,
      level: 2,
      text: `H${i}`,
      lineStart: i * 10 + 1,
    }));
    // 各セクションの見出し行 +5 行目に1件ずつ
    const comments = items.map((item, i) =>
      makeComment({ id: i + 1, lineStart: item.lineStart + 5 }),
    );
    const stats = computeOutlineStats(items, comments, new Set(), null);
    for (const item of items) {
      expect(stats.get(item.key)?.openComments).toBe(1);
    }
  });

  test('最初の見出しより前の行は集計対象外', () => {
    const items = [{ key: 'toc-0', level: 1, text: 'Only', lineStart: 5 }];
    const comments = [makeComment({ id: 1, lineStart: 1 })];
    const stats = computeOutlineStats(items, comments, new Set(), null);
    expect(stats.get('toc-0')?.openComments).toBe(0);
  });

  test('解決済み・孤立コメントは数えない', () => {
    const items = makeItems();
    const comments = [
      makeComment({ id: 1, lineStart: 5, resolved: true }),
      makeComment({ id: 2, lineStart: 6 }), // 孤立扱いにする
      makeComment({ id: 3, lineStart: 7 }), // これだけ open
    ];
    const stats = computeOutlineStats(items, comments, new Set([2]), null);
    expect(stats.get('toc-0')?.openComments).toBe(1);
  });

  test('diff の block_type コメントは数えない', () => {
    const items = makeItems();
    const comments = [
      makeComment({
        id: 1,
        lineStart: 5,
        block_type: 'diff',
        context: { side: 'new', oldLine: null, newLine: 5, line: '', hunk: [] },
      }),
    ];
    const stats = computeOutlineStats(items, comments, new Set(), null);
    expect(stats.get('toc-0')?.openComments).toBe(0);
  });

  test('insert/equal 行は自身の新行番号が指す見出しへ加算される', () => {
    const items = makeItems();
    const diffData: DiffResponse = {
      hasCheckpoint: true,
      lines: [
        makeDiffLine({ n: 1, o: 1, type: 'equal', content: '# Sample' }),
        makeDiffLine({ n: 2, o: null, type: 'insert', content: 'new line' }), // Sample 配下
        makeDiffLine({ n: 12, o: 12, type: 'insert', content: 'x' }), // Section 配下
      ],
    };
    const stats = computeOutlineStats(items, [], new Set(), diffData);
    expect(stats.get('toc-0')?.added).toBe(1);
    expect(stats.get('toc-1')?.added).toBe(1);
  });

  test('delete 行（n が null）は直前の現在行番号が指す見出しへ帰属する', () => {
    const items = makeItems();
    const diffData: DiffResponse = {
      hasCheckpoint: true,
      lines: [
        makeDiffLine({ n: 12, o: 12, type: 'equal', content: 'context' }), // Section 配下まで進める
        makeDiffLine({ n: null, o: 13, type: 'delete', content: 'removed' }),
      ],
    };
    const stats = computeOutlineStats(items, [], new Set(), diffData);
    expect(stats.get('toc-1')?.deleted).toBe(1);
    expect(stats.get('toc-0')?.deleted).toBe(0);
  });

  test('最初の等価/挿入行より前の削除行は帰属先がなく無視される', () => {
    const items = makeItems();
    const diffData: DiffResponse = {
      hasCheckpoint: true,
      lines: [makeDiffLine({ n: null, o: 1, type: 'delete', content: 'x' })],
    };
    const stats = computeOutlineStats(items, [], new Set(), diffData);
    for (const s of stats.values()) expect(s.deleted).toBe(0);
  });

  test('diffData が null なら diff 集計はゼロのまま', () => {
    const items = makeItems();
    const stats = computeOutlineStats(items, [], new Set(), null);
    for (const s of stats.values()) {
      expect(s.added).toBe(0);
      expect(s.deleted).toBe(0);
    }
  });
});
