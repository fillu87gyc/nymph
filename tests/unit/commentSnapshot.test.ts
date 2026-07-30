import { describe, expect, test } from 'vitest';
import {
  buildCommentSnapshot,
  diffSideLines,
  SNAPSHOT_CONTEXT_LINES,
  sliceSnapshot,
  snapshotRows,
} from '../../src/client/lib/snapshot.ts';
import type {
  DiffContext,
  DiffResponse,
  PendingComment,
} from '../../src/client/types.ts';

// 1..20 の行番号がそのまま中身になるダミー本文
const LINES = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
const SOURCE = LINES.join('\n');

function makePending(overrides: Partial<PendingComment> = {}): PendingComment {
  return {
    lineStart: 10,
    lineEnd: 10,
    block_type: 'paragraph',
    context: 'line 10',
    selection_offset: null,
    ...overrides,
  };
}

describe('sliceSnapshot', () => {
  test('前後 5 行ずつ切り出す', () => {
    const snap = sliceSnapshot(LINES, 10, 10);
    expect(snap).not.toBeNull();
    expect(snap?.startLine).toBe(10);
    expect(snap?.before).toEqual([
      'line 5',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
    ]);
    expect(snap?.target).toEqual(['line 10']);
    expect(snap?.after).toEqual([
      'line 11',
      'line 12',
      'line 13',
      'line 14',
      'line 15',
    ]);
  });

  test('既定のコンテキスト行数は 5', () => {
    expect(SNAPSHOT_CONTEXT_LINES).toBe(5);
  });

  test('複数行にまたがる対象範囲をすべて保持する', () => {
    const snap = sliceSnapshot(LINES, 8, 11);
    expect(snap?.target).toEqual(['line 8', 'line 9', 'line 10', 'line 11']);
    expect(snap?.before).toEqual([
      'line 3',
      'line 4',
      'line 5',
      'line 6',
      'line 7',
    ]);
    expect(snap?.after).toEqual([
      'line 12',
      'line 13',
      'line 14',
      'line 15',
      'line 16',
    ]);
  });

  test('ファイル先頭付近では before が 5 行未満になる', () => {
    const snap = sliceSnapshot(LINES, 2, 2);
    expect(snap?.before).toEqual(['line 1']);
    expect(snap?.target).toEqual(['line 2']);
    expect(snap?.startLine).toBe(2);
  });

  test('ファイル末尾付近では after が 5 行未満になる', () => {
    const snap = sliceSnapshot(LINES, 19, 20);
    expect(snap?.target).toEqual(['line 19', 'line 20']);
    expect(snap?.after).toEqual([]);
  });

  test('範囲外の行を指すと null', () => {
    expect(sliceSnapshot(LINES, 0, 0)).toBeNull();
    expect(sliceSnapshot(LINES, 21, 21)).toBeNull();
    expect(sliceSnapshot([], 1, 1)).toBeNull();
  });

  test('lineEnd が lineStart より小さいときは lineStart のみを対象にする', () => {
    const snap = sliceSnapshot(LINES, 10, 3);
    expect(snap?.target).toEqual(['line 10']);
  });

  test('lineEnd が末尾を超えても末尾までで打ち切る', () => {
    const snap = sliceSnapshot(LINES, 19, 99);
    expect(snap?.target).toEqual(['line 19', 'line 20']);
  });
});

describe('snapshotRows', () => {
  test('行番号を振り、対象行にフラグを立てる', () => {
    const rows = snapshotRows({
      startLine: 10,
      before: ['line 8', 'line 9'],
      target: ['line 10', 'line 11'],
      after: ['line 12'],
    });
    expect(rows.map((r) => r.n)).toEqual([8, 9, 10, 11, 12]);
    expect(rows.map((r) => r.isTarget)).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(rows[2].text).toBe('line 10');
  });

  test('ファイル先頭のコメントでも行番号が 1 から始まる', () => {
    const rows = snapshotRows({
      startLine: 1,
      before: [],
      target: ['line 1'],
      after: ['line 2'],
    });
    expect(rows.map((r) => r.n)).toEqual([1, 2]);
  });
});

describe('diffSideLines', () => {
  const diff: DiffResponse = {
    hasCheckpoint: true,
    lines: [
      { n: 1, o: 1, type: 'equal', content: 'same', g: null },
      { n: null, o: 2, type: 'delete', content: 'gone', g: 1 },
      { n: 2, o: null, type: 'insert', content: 'added', g: 1 },
      { n: 3, o: 3, type: 'equal', content: 'tail', g: null },
    ],
  };

  test('old 側は削除行を含む行順の配列になる', () => {
    expect(diffSideLines(diff.lines, 'old')).toEqual(['same', 'gone', 'tail']);
  });

  test('new 側は追加行を含む行順の配列になる', () => {
    expect(diffSideLines(diff.lines, 'new')).toEqual(['same', 'added', 'tail']);
  });

  test('欠番は空行で埋める', () => {
    expect(
      diffSideLines(
        [{ n: 3, o: null, type: 'insert', content: 'x', g: 1 }],
        'new',
      ),
    ).toEqual(['', '', 'x']);
  });
});

describe('buildCommentSnapshot', () => {
  test('本文コメントは本文から前後 5 行を切り出す', () => {
    const snap = buildCommentSnapshot(makePending(), SOURCE, null);
    expect(snap?.target).toEqual(['line 10']);
    expect(snap?.before).toHaveLength(5);
    expect(snap?.after).toHaveLength(5);
  });

  test('本文が空なら null', () => {
    expect(buildCommentSnapshot(makePending(), '', null)).toBeNull();
  });

  test('差分コメントは diff の該当サイドから切り出す', () => {
    const diffData: DiffResponse = {
      hasCheckpoint: true,
      lines: LINES.map((content, i) => ({
        n: i + 1,
        o: i + 1,
        type: 'equal' as const,
        content,
        g: null,
      })),
    };
    const ctx: DiffContext = {
      side: 'new',
      oldLine: 10,
      newLine: 10,
      line: 'line 10',
      hunk: [],
    };
    const snap = buildCommentSnapshot(
      makePending({ block_type: 'diff', context: ctx }),
      // 差分コメントは本文の行番号ではなく diff の行番号を使う
      '',
      diffData,
    );
    expect(snap?.startLine).toBe(10);
    expect(snap?.target).toEqual(['line 10']);
    expect(snap?.before).toEqual([
      'line 5',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
    ]);
  });

  test('差分コメントで diff が未取得なら null', () => {
    const ctx: DiffContext = {
      side: 'new',
      oldLine: 1,
      newLine: 1,
      line: 'line 1',
      hunk: [],
    };
    expect(
      buildCommentSnapshot(
        makePending({ block_type: 'diff', context: ctx }),
        SOURCE,
        null,
      ),
    ).toBeNull();
  });

  test('差分コメントで context が DiffContext でなければ null', () => {
    expect(
      buildCommentSnapshot(
        makePending({ block_type: 'diff', context: 'text' }),
        SOURCE,
        { hasCheckpoint: true, lines: [] },
      ),
    ).toBeNull();
  });
});
