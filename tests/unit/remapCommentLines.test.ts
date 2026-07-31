import { describe, expect, test } from 'vitest';
import type { Comment, CommentSnapshot } from '../../src/client/types.ts';
import { remapCommentLines } from '../../src/server.ts';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    lineStart: 10,
    lineEnd: 12,
    block_type: 'paragraph',
    context: 'ctx',
    text: 'test',
    ...overrides,
  };
}

function makeSnapshot(startLine: number): CommentSnapshot {
  return { startLine, before: ['b'], target: ['t'], after: ['a'] };
}

describe('remapCommentLines', () => {
  test('編集より後ろのコメントは行番号がずれる', () => {
    const comments = [makeComment()];
    // 1 行目を 3 行に置換（+2 行）
    remapCommentLines(comments, 1, 1, 2);
    expect(comments[0].lineStart).toBe(12);
    expect(comments[0].lineEnd).toBe(14);
  });

  test('編集より後ろのコメントはスナップショットの行番号もずれる', () => {
    const comments = [makeComment({ snapshot: makeSnapshot(10) })];
    remapCommentLines(comments, 1, 1, 2);
    expect(comments[0].snapshot?.startLine).toBe(12);
    // lineStart と同じ量だけずれ、両者の対応が保たれる
    expect(comments[0].snapshot?.startLine).toBe(comments[0].lineStart);
  });

  test('行が減る編集ではスナップショットの行番号も戻る', () => {
    const comments = [makeComment({ snapshot: makeSnapshot(10) })];
    remapCommentLines(comments, 1, 3, -2);
    expect(comments[0].lineStart).toBe(8);
    expect(comments[0].snapshot?.startLine).toBe(8);
  });

  test('スナップショットの中身（前後の文章）は書き換えない', () => {
    const snapshot = makeSnapshot(10);
    const comments = [makeComment({ snapshot })];
    remapCommentLines(comments, 1, 1, 2);
    expect(comments[0].snapshot?.before).toEqual(['b']);
    expect(comments[0].snapshot?.target).toEqual(['t']);
    expect(comments[0].snapshot?.after).toEqual(['a']);
  });

  test('編集範囲をまたぐコメントは終端だけ伸縮し、スナップショットは動かない', () => {
    const comments = [
      makeComment({ lineStart: 5, lineEnd: 20, snapshot: makeSnapshot(5) }),
    ];
    remapCommentLines(comments, 6, 2, 3);
    expect(comments[0].lineStart).toBe(5);
    expect(comments[0].lineEnd).toBe(23);
    expect(comments[0].snapshot?.startLine).toBe(5);
  });

  test('編集より前のコメントは何も変わらない', () => {
    const comments = [
      makeComment({ lineStart: 2, lineEnd: 3, snapshot: makeSnapshot(2) }),
    ];
    remapCommentLines(comments, 10, 1, 5);
    expect(comments[0].lineStart).toBe(2);
    expect(comments[0].lineEnd).toBe(3);
    expect(comments[0].snapshot?.startLine).toBe(2);
  });

  test('スナップショットを持たない既存コメントでも落ちない', () => {
    const comments = [makeComment()];
    expect(() => remapCommentLines(comments, 1, 1, 2)).not.toThrow();
    expect(comments[0].snapshot).toBeUndefined();
  });

  test('行番号は 1 未満にならない', () => {
    const comments = [
      makeComment({ lineStart: 3, lineEnd: 3, snapshot: makeSnapshot(1) }),
    ];
    remapCommentLines(comments, 1, 2, -2);
    expect(comments[0].snapshot?.startLine).toBeGreaterThanOrEqual(1);
  });
});
